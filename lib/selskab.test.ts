// Tests for store selskaber med betalingsfrist.
//
// Det, der bevogtes her:
//  - fristen skal ligge fra i dag til forestillingsdagen
//  - en reservation ud over kapaciteten kræver bekræftelse, men er tilladt
//  - pladserne holdes uden udløb og frigives hverken af tiden eller af et
//    mislykket betalingsforsøg
//  - betalingssiden kræver den rigtige nøgle, og beløbet (billetter + drikke
//    med onlinerabat) beregnes på serveren
//  - en betaling på et ældre forsøg markerer stadig pladserne solgt
//  - faktura gør bookingen betalt, sælger pladserne og giver besked
//  - påmindelse 3 dage før fristen, én gang; annullering dagen efter fristen
//    kun når den er slået til

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type Queryable } from "@/lib/db";
import type { ShowDate } from "@/lib/events";
import type { AddonDef, TicketTypeDef } from "@/lib/ticket-checkout";
import type { CreatePaymentInput } from "@/lib/payments/types";
import type { AirtableRecord } from "@/lib/airtable";
import { FIELDS } from "@/lib/airtable";
import {
  frigivReservation,
  frigivUdloebne,
  hentTagne,
  markerSolgt,
  markerSolgtForBooking,
} from "@/lib/seat-holds";
import { getTicketPayment } from "@/lib/ticket-payments";
import {
  SELSKAB_STATUS,
  hentSelskab,
  koerFrister,
  markerBetaltFaktura,
  opretSelskab,
  startBetaling,
  hentSideVisning,
  tilvalgstekst,
  type BetalDeps,
  type FristDeps,
  type OpretDeps,
} from "@/lib/selskab";

let db: Queryable & { query: PGlite["query"] };

const SHOW: ShowDate = {
  id: "recShowSelskab0001",
  title: "Sommershow",
  date: "2099-06-05",
  time: "20:00",
  duration: "",
  notes: "",
  priceGroup: "2027",
  soldOut: false,
  kapacitetsjustering: { aplusForrest: null, aplusBagerst: null, a: 10, b: null },
};

const BILLETTYPER: TicketTypeDef[] = [
  {
    id: "recTypeA",
    category: "A (7.-8.-9. række)",
    price: 300,
    fee: 20,
    maxCount: 10,
    priceGroup: "2027",
    kapacitetskategori: "a",
  },
];
const TILVALG: AddonDef[] = [{ id: "recOel", name: "Fadøl stor", price: 60 }];
const IDAG = "2099-03-01";

// Et lille Airtable i hukommelsen.
let poster: Map<string, AirtableRecord>;
let tæller = 0;

function opretDeps(over: Partial<OpretDeps> = {}) {
  const mails: { to: string; subject: string; html: string }[] = [];
  const deps: OpretDeps = {
    db,
    hentShow: async (id) => (id === SHOW.id ? SHOW : null),
    hentBilletTyper: async () => BILLETTYPER,
    opretKunde: async (fields) => {
      const id = `recKunde${String(++tæller).padStart(9, "0")}`;
      poster.set(id, { id, fields });
      return { id };
    },
    opretBooking: async (fields) => {
      const id = `recBook${String(++tæller).padStart(10, "0")}`;
      poster.set(id, { id, fields });
      return { id };
    },
    sendMail: async (m) => {
      mails.push(m);
    },
    origin: "https://bakkenshvile.vercel.app",
    idag: IDAG,
    ...over,
  };
  return { deps, mails };
}

function bookingEfterNr(nr: string): AirtableRecord | null {
  for (const p of Array.from(poster.values())) {
    if (p.fields[FIELDS.booking.bookingNo] === nr) return p;
  }
  return null;
}

function betalDeps(over: Partial<BetalDeps> = {}) {
  const betalinger: CreatePaymentInput[] = [];
  const deps: BetalDeps = {
    db,
    hentShow: async (id) => (id === SHOW.id ? SHOW : null),
    hentBilletTyper: async () => BILLETTYPER,
    findBooking: async (nr) => bookingEfterNr(nr),
    hentTilvalg: async () => TILVALG,
    rabatAktiv: () => true,
    idag: IDAG,
    opretBetaling: async (input) => {
      betalinger.push(input);
      return {
        paymentRef: `91000000000${String(++tæller).padStart(5, "0")}`,
        redirectUrl: "https://demo.vivapayments.com/web/checkout?ref=1",
      };
    },
    sourceCode: "6238",
    origin: "https://bakkenshvile.vercel.app",
    ...over,
  };
  return { deps, betalinger };
}

const KUNDE = { name: "Firma A/S v. Lone", email: "lone@firma.dk", phone: "12345678", company: "Firma A/S" };

async function opret12(over: Record<string, unknown> = {}) {
  const { deps, mails } = opretDeps();
  const svar = await opretSelskab(deps, {
    showId: SHOW.id,
    tickets: [{ ticketTypeId: "recTypeA", quantity: 8 }],
    customer: KUNDE,
    frist: "2099-04-01",
    ...over,
  });
  return { svar, mails };
}

function noegleFra(link: string): string {
  return new URL(link).searchParams.get("k") ?? "";
}

beforeAll(async () => {
  db = new PGlite() as unknown as Queryable & { query: PGlite["query"] };
  await applyMigrations(db);
});

beforeEach(async () => {
  await db.query("TRUNCATE seat_holds, seat_counters, ticket_payments, group_reservations");
  poster = new Map();
});

describe("oprettelse", () => {
  it("afviser en frist før i dag og efter forestillingen", async () => {
    expect((await opret12({ frist: "2099-02-28" })).svar).toMatchObject({ ok: false, status: 400 });
    expect((await opret12({ frist: "2099-06-06" })).svar).toMatchObject({ ok: false, status: 400 });
    expect((await opret12({ frist: "" })).svar).toMatchObject({ ok: false, status: 400 });
  });

  it("opretter booking, holder pladserne uden udløb og sender mail med link", async () => {
    const { svar, mails } = await opret12();
    expect(svar.ok).toBe(true);
    if (!svar.ok) return;
    const booking = poster.get(svar.bookingId)!;
    expect(booking.fields[FIELDS.booking.status]).toBe(SELSKAB_STATUS);
    expect(booking.fields[FIELDS.booking.betalingsfrist]).toBe("2099-04-01");
    expect(svar.bookingNo.startsWith("BH-SEL-")).toBe(true);
    expect(svar.billetterKr).toBe(8 * 320);
    expect((await hentTagne(db, SHOW.id)).a).toBe(8);
    const { rows } = await db.query<{ source: string; expires_at: string | null }>(
      "SELECT source, expires_at FROM seat_holds"
    );
    expect(rows).toEqual([{ source: "selskab", expires_at: null }]);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("lone@firma.dk");
    expect(mails[0].html).toContain(svar.betalingsside.replace(/&/g, "&amp;"));
    expect(noegleFra(svar.betalingsside)).toBe(booking.fields[FIELDS.booking.key]);
  });

  it("tillader flere billetter end billettypens max pr. køb", async () => {
    const { deps } = opretDeps();
    const svar = await opretSelskab(deps, {
      showId: SHOW.id,
      tickets: [{ ticketTypeId: "recTypeA", quantity: 10 }],
      customer: KUNDE,
      frist: "2099-04-01",
    });
    expect(svar.ok).toBe(true);
  });

  it("kræver bekræftelse ud over kapaciteten, men tillader det bagefter", async () => {
    const for_meget = { tickets: [{ ticketTypeId: "recTypeA", quantity: 12 }] };
    const foerst = (await opret12(for_meget)).svar;
    expect(foerst).toMatchObject({ ok: false, status: 409, kraeverBekraeftelse: true });
    expect(poster.size).toBe(0);
    const bagefter = (await opret12({ ...for_meget, bekraeftOversalg: true })).svar;
    expect(bagefter.ok).toBe(true);
    expect((await hentTagne(db, SHOW.id)).a).toBe(12);
  });

  it("frigives ikke af tiden", async () => {
    await opret12();
    await db.query("UPDATE seat_holds SET created_at = now() - interval '400 days'");
    await frigivUdloebne(db, SHOW.id);
    expect((await hentTagne(db, SHOW.id)).a).toBe(8);
  });
});

describe("kundens betalingsside", () => {
  it("afviser en forkert nøgle", async () => {
    const { svar } = await opret12();
    if (!svar.ok) throw new Error();
    const { deps } = betalDeps();
    expect(await hentSideVisning(deps, svar.bookingNo, "forkert")).toBeNull();
    expect(await startBetaling(deps, { bookingNo: svar.bookingNo, noegle: "forkert" })).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("beregner billetter + drikkevarer med onlinerabat på serveren", async () => {
    const { svar } = await opret12();
    if (!svar.ok) throw new Error();
    const { deps, betalinger } = betalDeps();
    const noegle = noegleFra(svar.betalingsside);
    const side = await hentSideVisning(deps, svar.bookingNo, noegle);
    expect(side?.tilstand).toBe("aaben");
    expect(side?.billetterOre).toBe(8 * 32000);
    const r = await startBetaling(deps, {
      bookingNo: svar.bookingNo,
      noegle,
      addons: [{ addonId: "recOel", quantity: 4 }],
    });
    expect(r.ok).toBe(true);
    // 8 × 320 kr. + 4 × 60 kr. − 10 % af drikkevarerne (4 × 6 kr.)
    expect(betalinger[0].totalOre).toBe(256000 + 24000 - 2400);
    expect(betalinger[0].tags).toEqual(["billet", svar.bookingId]);
    const { rows } = await db.query<{ payment_ref: string }>("SELECT payment_ref FROM seat_holds");
    const p = await getTicketPayment(db, rows[0].payment_ref);
    expect(p?.flow).toBe("billet");
    expect(p?.expectedTotalOre).toBe(256000 + 24000 - 2400);
  });

  it("et mislykket forsøg frigiver ikke pladserne", async () => {
    const { svar } = await opret12();
    if (!svar.ok) throw new Error();
    const { deps } = betalDeps();
    await startBetaling(deps, { bookingNo: svar.bookingNo, noegle: noegleFra(svar.betalingsside) });
    const { rows } = await db.query<{ payment_ref: string }>("SELECT payment_ref FROM seat_holds");
    await frigivReservation(db, rows[0].payment_ref);
    expect((await hentTagne(db, SHOW.id)).a).toBe(8);
  });

  it("markerer solgt via bookingen, når et ældre forsøg betales", async () => {
    const { svar } = await opret12();
    if (!svar.ok) throw new Error();
    const { deps } = betalDeps();
    const noegle = noegleFra(svar.betalingsside);
    await startBetaling(deps, { bookingNo: svar.bookingNo, noegle });
    const { rows: foerste } = await db.query<{ payment_ref: string }>("SELECT payment_ref FROM seat_holds");
    await startBetaling(deps, { bookingNo: svar.bookingNo, noegle });
    expect((await markerSolgt(db, foerste[0].payment_ref)).linjer).toBe(0);
    expect((await markerSolgtForBooking(db, svar.bookingId)).linjer).toBe(1);
    const { rows } = await db.query<{ status: string }>("SELECT status FROM seat_holds");
    expect(rows[0].status).toBe("sold");
  });

  it("lukker for betaling efter fristen", async () => {
    const { svar } = await opret12();
    if (!svar.ok) throw new Error();
    const { deps } = betalDeps({ idag: "2099-04-02" });
    const r = await startBetaling(deps, { bookingNo: svar.bookingNo, noegle: noegleFra(svar.betalingsside) });
    expect(r).toMatchObject({ ok: false, status: 410 });
  });

  it("laver tilvalgsteksten til bookingen ud fra de betalte linjer", () => {
    expect(
      tilvalgstekst([
        { description: "Billet", quantity: 2, amountSubtotalOre: 1, kind: "ticket" },
        { description: "Fadøl stor", quantity: 4, amountSubtotalOre: 1, kind: "addon" },
      ])
    ).toBe("Fadøl stor x4");
  });
});

describe("faktura", () => {
  it("gør bookingen betalt, sælger pladserne og giver besked", async () => {
    const { svar } = await opret12();
    if (!svar.ok) throw new Error();
    const opdateringer: Record<string, unknown>[] = [];
    const billetter: string[] = [];
    const kontor: string[] = [];
    const deps = {
      db,
      hentShow: async () => SHOW,
      hentBilletTyper: async () => BILLETTYPER,
      opdaterBooking: async (_id: string, f: Record<string, unknown>) => {
        opdateringer.push(f);
      },
      sendBillet: async (p: { email: string }) => {
        billetter.push(p.email);
      },
      meldTilKontoret: async (p: { bookingNo: string }) => {
        kontor.push(p.bookingNo);
      },
    };
    expect(await markerBetaltFaktura(deps, svar.bookingId)).toEqual({ ok: true });
    expect(opdateringer[0][FIELDS.booking.status]).toBe("Betalt");
    expect(opdateringer[0][FIELDS.booking.totalPaid]).toBe(2560);
    expect(billetter).toEqual(["lone@firma.dk"]);
    expect(kontor).toEqual([svar.bookingNo]);
    expect((await hentSelskab(db, svar.bookingId))?.paidAt).not.toBeNull();
    const { rows } = await db.query<{ status: string }>("SELECT status FROM seat_holds");
    expect(rows[0].status).toBe("sold");
    expect(await markerBetaltFaktura(deps, svar.bookingId)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("daglig kørsel", () => {
  function fristDeps(idag: string, autoAnnuller: boolean) {
    const mails: { to: string; subject: string }[] = [];
    const opdateringer: Record<string, unknown>[] = [];
    const deps: FristDeps = {
      db,
      hentShow: async () => SHOW,
      hentBilletTyper: async () => BILLETTYPER,
      hentBooking: async (id) => poster.get(id) ?? null,
      opdaterBooking: async (id, f) => {
        opdateringer.push(f);
        const p = poster.get(id)!;
        p.fields = { ...p.fields, ...f };
      },
      sendMail: async (m) => {
        mails.push(m);
      },
      origin: "https://bakkenshvile.vercel.app",
      idag,
      kontorMail: "dot@bakkenshvile.dk",
      autoAnnuller,
    };
    return { deps, mails, opdateringer };
  }

  it("sender påmindelse 3 dage før fristen og kun én gang", async () => {
    await opret12();
    const tidligt = fristDeps("2099-03-28", true);
    expect((await koerFrister(tidligt.deps)).paamindelser).toBe(0);
    const dagen = fristDeps("2099-03-29", true);
    expect((await koerFrister(dagen.deps)).paamindelser).toBe(1);
    expect(dagen.mails[0].to).toBe("lone@firma.dk");
    const igen = fristDeps("2099-03-30", true);
    expect((await koerFrister(igen.deps)).paamindelser).toBe(0);
  });

  it("annullerer ikke, når den automatiske annullering er slået fra", async () => {
    const { svar } = await opret12();
    if (!svar.ok) throw new Error();
    const f = fristDeps("2099-04-02", false);
    const r = await koerFrister(f.deps);
    expect(r.annulleret).toBe(0);
    expect(r.overskredet).toEqual([svar.bookingNo]);
    expect((await hentTagne(db, SHOW.id)).a).toBe(8);
    expect(f.mails).toHaveLength(0);
  });

  it("annullerer dagen efter fristen, frigiver pladserne og giver besked", async () => {
    const { svar } = await opret12();
    if (!svar.ok) throw new Error();
    expect((await koerFrister(fristDeps("2099-04-01", true).deps)).annulleret).toBe(0);
    const f = fristDeps("2099-04-02", true);
    expect((await koerFrister(f.deps)).annulleret).toBe(1);
    expect(f.opdateringer[0][FIELDS.booking.status]).toBe("Annulleret");
    expect((await hentTagne(db, SHOW.id)).a).toBe(0);
    expect(f.mails.map((m) => m.to).sort()).toEqual(["dot@bakkenshvile.dk", "lone@firma.dk"]);
    expect((await koerFrister(fristDeps("2099-04-03", true).deps)).annulleret).toBe(0);
  });

  it("rører ikke en booking, der er sat til Betalt i Airtable", async () => {
    const { svar } = await opret12();
    if (!svar.ok) throw new Error();
    poster.get(svar.bookingId)!.fields[FIELDS.booking.status] = "Betalt";
    const f = fristDeps("2099-04-02", true);
    expect((await koerFrister(f.deps)).annulleret).toBe(0);
    expect((await hentSelskab(db, svar.bookingId))?.paidAt).not.toBeNull();
    expect((await hentTagne(db, SHOW.id)).a).toBe(8);
  });
});
