// Tests for advarslen om dobbeltbooking (funktion 2).
//
// Reglen: en BETALT billetbooking inden for den seneste time med samme e-mail
// (uden hensyn til store/små bogstaver og mellemrum), samme forestilling og
// samme antal gæster giver en advarsel. Alt andet giver ingen advarsel, og
// fejl i opslaget må aldrig blokere et køb.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type Queryable } from "@/lib/db";
import { FIELDS } from "@/lib/airtable";
import {
  hentBetalteBookingIds,
  normaliserEmail,
  tjekDobbeltbooking,
  type DobbeltDeps,
} from "@/lib/dobbeltbooking";
import { createTicketPayment, markTicketPaidByRef } from "@/lib/ticket-payments";

let db: Queryable & { query: PGlite["query"] };

const SHOW = "recShow0000000001";
const NU = new Date("2026-11-02T12:30:00Z");

beforeAll(async () => {
  db = new PGlite() as unknown as Queryable & { query: PGlite["query"] };
  await applyMigrations(db);
});

beforeEach(async () => {
  await db.query("TRUNCATE ticket_payments");
});

type Fakebooking = { status: string; show: string; antal: number };
const bookinger = new Map<string, Fakebooking>();

beforeEach(() => bookinger.clear());

let tael = 0;
/** Opretter en betaling i den rigtige ledger og en tilhørende booking i en falsk Airtable. */
async function betaling(
  o: {
    email?: string | null;
    flow?: "billet" | "genbestil";
    betalt?: boolean;
    betaltMinutterSiden?: number;
    status?: string;
    show?: string;
    antal?: number;
  } = {}
) {
  tael += 1;
  const ref = String(1000000000000000 + tael);
  const bookingId = `recBooking${String(tael).padStart(6, "0")}`;
  await createTicketPayment(db, {
    paymentRef: ref,
    flow: o.flow ?? "billet",
    bookingId,
    bookingNo: `BH-TEST${tael}`,
    customerEmail: o.email === undefined ? "gaest@eksempel.dk" : o.email,
    customerName: "Test Gæst",
    expectedTotalOre: 52500,
    lineItems: [],
  });
  if (o.betalt !== false) {
    await markTicketPaidByRef(db, { paymentRef: ref, amountOre: 52500, currency: "dkk" });
    const minutter = o.betaltMinutterSiden ?? 10;
    await db.query(
      `UPDATE ticket_payments SET paid_at = $2::timestamptz WHERE payment_ref = $1`,
      [ref, new Date(NU.getTime() - minutter * 60_000).toISOString()]
    );
  }
  bookinger.set(bookingId, {
    status: o.status ?? "Betalt",
    show: o.show ?? SHOW,
    antal: o.antal ?? 2,
  });
  return bookingId;
}

function deps(over: Partial<DobbeltDeps> = {}): DobbeltDeps & { log: ReturnType<typeof vi.fn> } {
  const log = vi.fn();
  return {
    hentBetalteBookingIds: (email, fra) => hentBetalteBookingIds(db, email, fra),
    hentBooking: async (id) => {
      const b = bookinger.get(id);
      if (!b) return null;
      return {
        id,
        fields: {
          [FIELDS.booking.status]: b.status,
          [FIELDS.booking.show]: [b.show],
          [FIELDS.booking.ticketCount]: b.antal,
        },
      };
    },
    nu: () => NU,
    log,
    ...over,
  } as DobbeltDeps & { log: ReturnType<typeof vi.fn> };
}

const KUNDE = { email: "gaest@eksempel.dk", showId: SHOW, antal: 2 };

describe("normaliserEmail", () => {
  it("ser bort fra store/små bogstaver og alle mellemrum", () => {
    expect(normaliserEmail("  Gaest@Eksempel.DK ")).toBe("gaest@eksempel.dk");
    expect(normaliserEmail("gaest @ eksempel.dk")).toBe("gaest@eksempel.dk");
    expect(normaliserEmail("gaest@eksempel.dk\n")).toBe("gaest@eksempel.dk");
    expect(normaliserEmail(null)).toBe("");
    expect(normaliserEmail(undefined)).toBe("");
  });
});

describe("tjekDobbeltbooking", () => {
  it("MATCH: samme e-mail, forestilling og antal, betalt for 10 minutter siden", async () => {
    await betaling();
    expect(await tjekDobbeltbooking(deps(), KUNDE)).toBe(true);
  });

  it("INGEN MATCH: anden e-mail", async () => {
    await betaling({ email: "anden@eksempel.dk" });
    expect(await tjekDobbeltbooking(deps(), KUNDE)).toBe(false);
  });

  it("INGEN MATCH: ingen tidligere bookinger overhovedet", async () => {
    expect(await tjekDobbeltbooking(deps(), KUNDE)).toBe(false);
  });

  it("MERE END EN TIME SIDEN: betalt for 61 minutter siden", async () => {
    await betaling({ betaltMinutterSiden: 61 });
    expect(await tjekDobbeltbooking(deps(), KUNDE)).toBe(false);
  });

  it("lige inden for en time (59 minutter) giver advarsel", async () => {
    await betaling({ betaltMinutterSiden: 59 });
    expect(await tjekDobbeltbooking(deps(), KUNDE)).toBe(true);
  });

  it("ANDET ANTAL: samme e-mail og forestilling, men 3 gæster mod 2", async () => {
    await betaling({ antal: 3 });
    expect(await tjekDobbeltbooking(deps(), KUNDE)).toBe(false);
  });

  it("ANDEN FORESTILLING", async () => {
    await betaling({ show: "recAndenShow00001" });
    expect(await tjekDobbeltbooking(deps(), KUNDE)).toBe(false);
  });

  it("UBETALT BOOKING: betalingen er kun påbegyndt, ingen advarsel", async () => {
    await betaling({ betalt: false, status: "Afventer betaling" });
    expect(await tjekDobbeltbooking(deps(), KUNDE)).toBe(false);
  });

  it("UBETALT i Airtable: ledgeren siger betalt, men bookingen står ikke som betalt", async () => {
    await betaling({ status: "Afventer betaling" });
    expect(await tjekDobbeltbooking(deps(), KUNDE)).toBe(false);
  });

  it("ANNULLERET booking giver ingen advarsel", async () => {
    await betaling({ status: "Annulleret" });
    expect(await tjekDobbeltbooking(deps(), KUNDE)).toBe(false);
  });

  it("FORSKELLIG SKRIVEMÅDE af e-mailen: store bogstaver og mellemrum", async () => {
    await betaling({ email: "  Gaest@Eksempel.DK " });
    expect(await tjekDobbeltbooking(deps(), { ...KUNDE, email: "gaest@eksempel.dk" })).toBe(true);
    expect(await tjekDobbeltbooking(deps(), { ...KUNDE, email: " GAEST@eksempel.dk  " })).toBe(true);
  });

  it("FEJL I OPSLAGET i databasen: ingen advarsel, fejlen logges uden e-mail", async () => {
    const d = deps({
      hentBetalteBookingIds: async () => {
        throw new Error("database nede");
      },
    });
    expect(await tjekDobbeltbooking(d, KUNDE)).toBe(false);
    expect(d.log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(d.log.mock.calls)).not.toContain("gaest@eksempel.dk");
    expect(JSON.stringify(d.log.mock.calls)).not.toContain("@");
  });

  it("FEJL I OPSLAGET i Airtable: ingen advarsel, fejlen logges", async () => {
    await betaling();
    const d = deps({
      hentBooking: async () => {
        throw new Error("Airtable nede");
      },
    });
    expect(await tjekDobbeltbooking(d, KUNDE)).toBe(false);
    expect(d.log).toHaveBeenCalledTimes(1);
  });

  it("genbestilling af drikkevarer tæller ikke som en tidligere booking", async () => {
    await betaling({ flow: "genbestil" });
    expect(await tjekDobbeltbooking(deps(), KUNDE)).toBe(false);
  });

  it("uden e-mail (kun telefon) sker der intet opslag", async () => {
    await betaling();
    const hent = vi.fn(async () => [] as string[]);
    const d = deps({ hentBetalteBookingIds: hent });
    expect(await tjekDobbeltbooking(d, { ...KUNDE, email: "" })).toBe(false);
    expect(await tjekDobbeltbooking(d, { ...KUNDE, email: "   " })).toBe(false);
    expect(await tjekDobbeltbooking(d, { ...KUNDE, email: undefined })).toBe(false);
    expect(hent).not.toHaveBeenCalled();
  });

  it("spørger kun om den seneste time", async () => {
    const hent = vi.fn(async () => [] as string[]);
    await tjekDobbeltbooking(deps({ hentBetalteBookingIds: hent }), KUNDE);
    expect(hent).toHaveBeenCalledWith("gaest@eksempel.dk", new Date(NU.getTime() - 60 * 60_000));
  });

  it("slår kun de få matchende bookinger op i Airtable", async () => {
    await betaling({ email: "anden@eksempel.dk" });
    await betaling({ email: "tredje@eksempel.dk" });
    const hentBooking = vi.fn(async () => null);
    await tjekDobbeltbooking(deps({ hentBooking }), KUNDE);
    expect(hentBooking).not.toHaveBeenCalled();
  });
});

describe("hentBetalteBookingIds", () => {
  it("returnerer kun betalte billetbetalinger inden for tidsrummet med samme e-mail", async () => {
    const ja = await betaling({ email: "Gaest@Eksempel.dk " });
    await betaling({ betaltMinutterSiden: 120 });
    await betaling({ betalt: false });
    await betaling({ flow: "genbestil" });
    await betaling({ email: "andre@eksempel.dk" });
    const ids = await hentBetalteBookingIds(db, "gaest@eksempel.dk", new Date(NU.getTime() - 60 * 60_000));
    expect(ids).toEqual([ja]);
  });
});
