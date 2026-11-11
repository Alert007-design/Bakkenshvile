// Tests for flytning af en reservation til en anden dato (/admin/opslag).
//
// Det vigtigste, der bevogtes:
//  - kun betalte bookinger, kun kommende forestillinger
//  - mangler der plads, røres hverken pladser, Airtable eller kunden
//  - fejler Airtable, føres pladserne tilbage
//  - dyrere dato: betaling af forskellen oprettes i Viva og gemmes som flowet
//    "prisforskel"
//  - billigere dato: tilgodeseddel som betalt gavekort med udløb på dagen
//  - fribilletter giver aldrig prisforskel
//  - kunden får en ny billet med den nye dato

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type Queryable } from "@/lib/db";
import { FIELDS } from "@/lib/airtable";
import type { ShowDate } from "@/lib/events";
import type { TicketTypeDef } from "@/lib/ticket-checkout";
import type { CreatePaymentInput } from "@/lib/payments/types";
import { hentPladslinjer, hentTagne, registrerSalg } from "@/lib/seat-holds";
import { getTicketPayment } from "@/lib/ticket-payments";
import { flytBooking, beregnPrisforskel, type FlytDeps } from "@/lib/flyt-booking";

let db: Queryable & { query: PGlite["query"] };

const BOOKING = "recBooking0000001";
const KUNDE = "recKunde000000001";
// 11-11-2026 kl. 20.15 dansk tid.
const NU = new Date("2026-11-11T19:15:00Z");

function show(id: string, date: string, priceGroup: string, a: number | null = null): ShowDate {
  return {
    id,
    title: "Sangerinderne",
    date,
    time: "19:30",
    duration: "",
    notes: "",
    priceGroup,
    soldOut: false,
    kapacitetsjustering: { aplusForrest: null, aplusBagerst: null, a, b: null },
  };
}

const FRA = show("recShowFra0000001", "2027-05-20", "Normal");
const SAMME = show("recShowSam0000001", "2027-05-21", "Normal");
const DYR = show("recShowDyr0000001", "2027-05-22", "Weekend");
const BILLIG = show("recShowBil0000001", "2027-05-23", "Hverdag");
const FULD = show("recShowFul0000001", "2027-05-24", "Normal", 1);
const FORTID = show("recShowGam0000001", "2026-11-01", "Normal");

function type(id: string, priceGroup: string, category: string, price: number, kat: "a" | "b"): TicketTypeDef {
  return { id, category, price, fee: 20, maxCount: 10, priceGroup, kapacitetskategori: kat };
}

const TYPER: TicketTypeDef[] = [
  type("recTypeNormalA", "Normal", "A (7.-8.-9. række)", 279, "a"),
  type("recTypeNormalB", "Normal", "B", 229, "b"),
  type("recTypeWeekendA", "Weekend", "A (7.-8.-9. række)", 329, "a"),
  type("recTypeWeekendB", "Weekend", "B", 259, "b"),
  type("recTypeHverdagA", "Hverdag", "A (7.-8.-9. række)", 249, "a"),
  type("recTypeHverdagB", "Hverdag", "B", 199, "b"),
];

function lavDeps(
  bookingFields: Record<string, unknown> = {},
  over: Partial<FlytDeps> = {}
) {
  const opdateringer: Record<string, unknown>[] = [];
  const betalinger: CreatePaymentInput[] = [];
  const mails: { to: string; subject: string; html: string }[] = [];
  const logs: string[] = [];
  const shows = [FRA, SAMME, DYR, BILLIG, FULD, FORTID];
  const deps: FlytDeps = {
    db,
    hentBooking: async (id) =>
      id === BOOKING
        ? {
            id,
            fields: {
              [FIELDS.booking.bookingNo]: "BH-K7M2Q9XR",
              [FIELDS.booking.status]: "Betalt",
              [FIELDS.booking.show]: [FRA.id],
              [FIELDS.booking.customer]: [KUNDE],
              [FIELDS.booking.ticketBreakdown]: "A (7.-8.-9. række) x2, B x1",
              [FIELDS.booking.tableNumber]: "12",
              [FIELDS.booking.gaestenummer]: 7,
              [FIELDS.booking.varselSent]: true,
              [FIELDS.booking.specialRequests]: "Show: 20. maj — Vegetar",
              ...bookingFields,
            },
          }
        : null,
    hentKunde: async () => ({
      id: KUNDE,
      fields: { [FIELDS.customer.name]: "Hanne Hansen", [FIELDS.customer.email]: "hanne@example.dk" },
    }),
    hentShow: async (id) => shows.find((s) => s.id === id) ?? null,
    hentBilletTyper: async () => TYPER,
    opdaterBooking: async (_id, felter) => {
      opdateringer.push(felter);
    },
    opretBetaling: async (input) => {
      betalinger.push(input);
      return { paymentRef: `9100000000${betalinger.length}`, redirectUrl: "https://demo.vivapayments.com/web/checkout?ref=1" };
    },
    sendMail: async (m) => {
      mails.push(m);
    },
    sourceCode: "6238",
    origin: "https://bakkenshvile.dk",
    nu: () => NU,
    log: (b) => {
      logs.push(b);
    },
    ...over,
  };
  return { deps, opdateringer, betalinger, mails, logs };
}

beforeAll(async () => {
  db = new PGlite() as unknown as Queryable & { query: PGlite["query"] };
  await applyMigrations(db);
});

beforeEach(async () => {
  await db.query("TRUNCATE seat_holds, seat_counters, ticket_payments, gift_cards");
  await registrerSalg(db, {
    showId: FRA.id,
    bookingId: BOOKING,
    oensker: [
      { kategori: "a", antal: 2, ticketTypeId: "recTypeNormalA" },
      { kategori: "b", antal: 1, ticketTypeId: "recTypeNormalB" },
    ],
    kilde: "import",
  });
});

describe("beregnPrisforskel", () => {
  it("regner forskellen ud pr. kategori inkl. gebyr", () => {
    const r = beregnPrisforskel(
      [
        { showId: FRA.id, kategori: "a", antal: 2, kilde: "checkout", ticketTypeId: "recTypeNormalA" },
        { showId: FRA.id, kategori: "b", antal: 1, kilde: "checkout", ticketTypeId: null },
      ],
      FRA,
      DYR,
      TYPER
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.forskelKr).toBe(2 * 50 + 30);
      expect(r.ticketBreakdown).toBe("A (7.-8.-9. række) x2, B x1");
      expect(r.nyeBilletTyper).toEqual({ a: "recTypeWeekendA", b: "recTypeWeekendB" });
    }
  });

  it("giver 0 kr. for fribilletter", () => {
    const r = beregnPrisforskel(
      [{ showId: FRA.id, kategori: "a", antal: 2, kilde: "fribillet", ticketTypeId: null }],
      FRA,
      DYR,
      TYPER
    );
    expect(r).toMatchObject({ ok: true, forskelKr: 0 });
  });

  it("afviser, når den nye prisgruppe mangler kategorien", () => {
    const r = beregnPrisforskel(
      [{ showId: FRA.id, kategori: "a", antal: 1, kilde: "checkout", ticketTypeId: null }],
      FRA,
      show("recShowX00000001", "2027-06-01", "Ukendt"),
      TYPER
    );
    expect(r.ok).toBe(false);
  });
});

describe("flytBooking – samme pris", () => {
  it("flytter pladserne, retter Airtable og sender en ny billet", async () => {
    const { deps, opdateringer, betalinger, mails } = lavDeps();
    const svar = await flytBooking(deps, BOOKING, SAMME.id);
    expect(svar).toMatchObject({ ok: true, prisforskelKr: 0, emailed: true });

    expect(await hentTagne(db, FRA.id)).toMatchObject({ a: 0, b: 0 });
    expect(await hentTagne(db, SAMME.id)).toMatchObject({ a: 2, b: 1 });

    const f = opdateringer[0];
    expect(f[FIELDS.booking.show]).toEqual([SAMME.id]);
    expect(f[FIELDS.booking.tableNumber]).toBe("");
    expect(f[FIELDS.booking.gaestenummer]).toBeNull();
    expect(f[FIELDS.booking.varselSent]).toBe(false);
    expect(String(f[FIELDS.booking.specialRequests])).toBe(
      "Show: 20. maj — Vegetar | Flyttet fra 20-05-2027 kl. 19.30 til 21-05-2027 kl. 19.30 af personale 11-11-2026 kl. 20.15"
    );

    expect(betalinger).toHaveLength(0);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("hanne@example.dk");
    expect(mails[0].subject).toContain("BH-K7M2Q9XR");
    expect(mails[0].html).toContain("Din reservation er flyttet");
    expect(mails[0].html).toContain("21.");
  });
});

describe("flytBooking – afvisninger", () => {
  it("rører intet, når der ikke er plads", async () => {
    const { deps, opdateringer, mails } = lavDeps();
    const svar = await flytBooking(deps, BOOKING, FULD.id);
    expect(svar).toMatchObject({ ok: false, status: 409 });
    if (!svar.ok) expect(svar.error).toMatch(/ikke plads/i);
    expect(opdateringer).toHaveLength(0);
    expect(mails).toHaveLength(0);
    expect(await hentTagne(db, FRA.id)).toMatchObject({ a: 2, b: 1 });
  });

  it("afviser en forestilling, der har været", async () => {
    const { deps, opdateringer } = lavDeps();
    expect(await flytBooking(deps, BOOKING, FORTID.id)).toMatchObject({ ok: false, status: 400 });
    expect(opdateringer).toHaveLength(0);
  });

  it("afviser den samme forestilling", async () => {
    const { deps } = lavDeps();
    expect(await flytBooking(deps, BOOKING, FRA.id)).toMatchObject({ ok: false, status: 400 });
  });

  it("afviser en booking, der ikke er betalt", async () => {
    const { deps, opdateringer } = lavDeps({ [FIELDS.booking.status]: "Afventer betaling" });
    expect(await flytBooking(deps, BOOKING, SAMME.id)).toMatchObject({ ok: false, status: 409 });
    expect(opdateringer).toHaveLength(0);
  });

  it("afviser en booking, der ikke findes", async () => {
    const { deps } = lavDeps();
    expect(await flytBooking(deps, "recFindesIkke0001", SAMME.id)).toMatchObject({ ok: false, status: 404 });
  });

  it("fører pladserne tilbage, når Airtable fejler", async () => {
    const { deps, mails } = lavDeps(
      {},
      {
        opdaterBooking: async () => {
          throw new Error("nede");
        },
      }
    );
    const svar = await flytBooking(deps, BOOKING, SAMME.id);
    expect(svar).toMatchObject({ ok: false, status: 502 });
    expect(await hentTagne(db, FRA.id)).toMatchObject({ a: 2, b: 1 });
    expect(await hentTagne(db, SAMME.id)).toMatchObject({ a: 0, b: 0 });
    expect((await hentPladslinjer(db, BOOKING)).every((l) => l.showId === FRA.id)).toBe(true);
    expect(mails).toHaveLength(0);
  });
});

describe("flytBooking – dyrere dato", () => {
  it("opretter betaling af forskellen og sender linket med billetten", async () => {
    const { deps, opdateringer, betalinger, mails } = lavDeps();
    const svar = await flytBooking(deps, BOOKING, DYR.id);
    expect(svar).toMatchObject({ ok: true, prisforskelKr: 130 });
    if (!svar.ok) return;

    expect(betalinger).toHaveLength(1);
    expect(betalinger[0].totalOre).toBe(13000);
    expect(betalinger[0].sourceCode).toBe("6238");
    expect(betalinger[0].tags).toEqual(["prisforskel", BOOKING]);

    const ledger = await getTicketPayment(db, svar.paymentRef!);
    expect(ledger?.flow).toBe("prisforskel");
    expect(ledger?.expectedTotalOre).toBe(13000);
    expect(ledger?.status).toBe("pending");
    expect(ledger?.lineItems[0].kind).toBe("ticket");

    expect(String(opdateringer[opdateringer.length - 1][FIELDS.booking.specialRequests])).toContain(
      "Prisforskel 130 kr. afventer betaling"
    );
    expect(mails[0].html).toContain("Betal med kort");
    expect(mails[0].html).toContain("130 kr.");
  });

  it("flytter stadig og siger til, når betalingen ikke kan oprettes", async () => {
    const { deps, mails } = lavDeps(
      {},
      {
        opretBetaling: async () => {
          throw new Error("Viva nede");
        },
      }
    );
    const svar = await flytBooking(deps, BOOKING, DYR.id);
    expect(svar).toMatchObject({ ok: true, prisforskelKr: 130 });
    if (svar.ok) expect(svar.advarsler.join(" ")).toMatch(/betalingslink/i);
    expect(await hentTagne(db, DYR.id)).toMatchObject({ a: 2, b: 1 });
    expect(mails[0].html).not.toContain("Betal med kort");
  });
});

describe("flytBooking – billigere dato", () => {
  it("udsteder en tilgodeseddel, der gælder på forestillingsdagen", async () => {
    const { deps, opdateringer, betalinger, mails } = lavDeps();
    const svar = await flytBooking(deps, BOOKING, BILLIG.id);
    expect(svar).toMatchObject({ ok: true, prisforskelKr: -90 });
    if (!svar.ok) return;
    expect(betalinger).toHaveLength(0);
    expect(svar.tilgodeseddel?.kode).toMatch(/^BH-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const { rows } = await db.query<{ amount_ore: string; status: string; expires_at: string; recipient_email: string }>(
      "SELECT amount_ore, status, expires_at, recipient_email FROM gift_cards"
    );
    expect(Number(rows[0].amount_ore)).toBe(9000);
    expect(rows[0].status).toBe("paid");
    expect(rows[0].recipient_email).toBe("hanne@example.dk");
    // Slutningen af 23. maj 2027 i dansk tid (sommertid, UTC+2).
    expect(new Date(rows[0].expires_at).toISOString()).toBe("2027-05-23T21:59:59.000Z");

    expect(String(opdateringer[opdateringer.length - 1][FIELDS.booking.specialRequests])).toContain(
      `Tilgodeseddel 90 kr. udstedt (kode ${svar.tilgodeseddel?.kode})`
    );
    expect(mails[0].html).toContain(svar.tilgodeseddel!.kode);
    expect(mails[0].html).toContain("90 kr.");
  });

  it("giver ingen tilgodeseddel for en fribillet", async () => {
    await db.query("UPDATE seat_holds SET source = 'fribillet'");
    const { deps, betalinger } = lavDeps();
    const svar = await flytBooking(deps, BOOKING, BILLIG.id);
    expect(svar).toMatchObject({ ok: true, prisforskelKr: 0 });
    expect(betalinger).toHaveLength(0);
    const { rows } = await db.query("SELECT * FROM gift_cards");
    expect(rows).toHaveLength(0);
  });
});

describe("flytBooking – mail", () => {
  it("flytter stadig og siger til, når mailen ikke kan sendes", async () => {
    const { deps } = lavDeps(
      {},
      {
        sendMail: async () => {
          throw new Error("Resend nede");
        },
      }
    );
    const svar = await flytBooking(deps, BOOKING, SAMME.id);
    expect(svar).toMatchObject({ ok: true, emailed: false });
  });
});
