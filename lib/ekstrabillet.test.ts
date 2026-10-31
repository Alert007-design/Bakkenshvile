// Tests for ekstra betalte billetter fra admin (ud over kapaciteten).
//
// Det, der bevogtes her:
//  - prisen beregnes kun på serveren (pris + gebyr fra Airtable), aldrig fra
//    browseren, og der kan ikke komme tilvalg med
//  - en fuld kategori giver en advarsel, og intet oprettes, før personalet har
//    bekræftet
//  - pladserne holdes i 24 timer uden loft og gives tilbage, når tiden udløber
//  - en betalt ekstrabillet tælles som solgt i pladsbogen, også ved oversalg
//  - betalingen oprettes, så den fælles webhook behandler den som et
//    almindeligt billetkøb (flow "billet", tags ["billet", bookingId], samme
//    beløbskontrol, ingen dobbeltbetaling, fejlet → betalt)

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type Queryable } from "@/lib/db";
import type { ShowDate } from "@/lib/events";
import type { TicketTypeDef } from "@/lib/ticket-checkout";
import type { CreatePaymentInput } from "@/lib/payments/types";
import { frigivUdloebne, hentTagne, markerSolgt } from "@/lib/seat-holds";
import {
  getTicketPayment,
  markTicketFailedByRef,
  markTicketPaidByRef,
} from "@/lib/ticket-payments";
import { FIELDS } from "@/lib/airtable";
import {
  EKSTRA_BETALINGSFRIST_MINUTTER,
  EKSTRA_HOLD_MINUTTER,
  EKSTRA_STATUS_AFVENTER,
  opretEkstrabillet,
  udloebneEkstrabilletter,
  type EkstraDeps,
} from "@/lib/ekstrabillet";

let db: Queryable & { query: PGlite["query"] };

const SHOW: ShowDate = {
  id: "recShowEkstra00001",
  title: "Forpremiere",
  date: "2099-05-10",
  time: "19:30",
  duration: "",
  notes: "",
  priceGroup: "2027",
  soldOut: true,
  kapacitetsjustering: { aplusForrest: null, aplusBagerst: null, a: 2, b: null },
};

const BILLETTYPER: TicketTypeDef[] = [
  {
    id: "recTypeA",
    category: "A (7.-8.-9. række)",
    price: 279,
    fee: 20,
    maxCount: 10,
    priceGroup: "2027",
    kapacitetskategori: "a",
  },
  {
    id: "recTypeAndenGruppe",
    category: "A (gammel pris)",
    price: 199,
    fee: 20,
    maxCount: 10,
    priceGroup: "2026",
    kapacitetskategori: "a",
  },
];

let tæller = 0;
function lavDeps(over: Partial<EkstraDeps> = {}) {
  const kunder: Record<string, unknown>[] = [];
  const bookinger: Record<string, unknown>[] = [];
  const betalinger: CreatePaymentInput[] = [];
  const mails: { to: string; subject: string; html: string }[] = [];
  const deps: EkstraDeps = {
    db,
    hentShow: async (id) => (id === SHOW.id ? SHOW : null),
    hentBilletTyper: async () => BILLETTYPER,
    opretKunde: async (fields) => {
      kunder.push(fields);
      return { id: `recKunde${++tæller}` };
    },
    opretBooking: async (fields) => {
      bookinger.push(fields);
      return { id: `recBooking${++tæller}` };
    },
    opretBetaling: async (input) => {
      betalinger.push(input);
      return {
        paymentRef: `90000000000${String(++tæller).padStart(5, "0")}`,
        redirectUrl: "https://demo.vivapayments.com/web/checkout?ref=1",
      };
    },
    sendMail: async (m) => {
      mails.push(m);
    },
    sourceCode: "6238",
    origin: "https://bakkenshvile.vercel.app",
    ...over,
  };
  return { deps, kunder, bookinger, betalinger, mails };
}

const GAEST = { name: "Hanne Hansen", email: "hanne@example.dk", phone: "12345678" };

beforeAll(async () => {
  db = new PGlite() as unknown as Queryable & { query: PGlite["query"] };
  await applyMigrations(db);
});

beforeEach(async () => {
  await db.query("TRUNCATE seat_holds, seat_counters, ticket_payments");
});

describe("prisberegning på serveren", () => {
  it("bruger pris + gebyr fra Airtable og ignorerer beløb fra browseren", async () => {
    const { deps, betalinger } = lavDeps();
    const svar = await opretEkstrabillet(deps, {
      showId: SHOW.id,
      tickets: [{ ticketTypeId: "recTypeA", quantity: 2 }],
      customer: GAEST,
      // Forsøg på at sende egen pris med: skal ignoreres.
      ...({ totalOre: 100, price: 1 } as object),
    });
    expect(svar.ok).toBe(true);
    expect(betalinger[0].totalOre).toBe(2 * (279 + 20) * 100);
    if (!svar.ok) return;
    const ledger = await getTicketPayment(db, svar.paymentRef);
    expect(ledger?.expectedTotalOre).toBe(59800);
    expect(ledger?.discountOre).toBe(0);
  });

  it("afviser billettyper fra en anden prisgruppe", async () => {
    const { deps, betalinger } = lavDeps();
    const svar = await opretEkstrabillet(deps, {
      showId: SHOW.id,
      tickets: [{ ticketTypeId: "recTypeAndenGruppe", quantity: 1 }],
      customer: GAEST,
    });
    expect(svar.ok).toBe(false);
    expect(betalinger).toHaveLength(0);
  });

  it("tager ikke tilvalg med, selv hvis de sendes", async () => {
    const { deps, betalinger } = lavDeps();
    const svar = await opretEkstrabillet(deps, {
      showId: SHOW.id,
      tickets: [{ ticketTypeId: "recTypeA", quantity: 1 }],
      customer: GAEST,
      ...({ addons: [{ addonId: "recDrink", quantity: 5 }] } as object),
    });
    expect(svar.ok).toBe(true);
    expect(betalinger[0].totalOre).toBe(29900);
  });

  it("kræver navn og e-mail", async () => {
    const { deps } = lavDeps();
    expect(
      (await opretEkstrabillet(deps, {
        showId: SHOW.id,
        tickets: [{ ticketTypeId: "recTypeA", quantity: 1 }],
        customer: { name: "", email: "x@example.dk" },
      })).ok
    ).toBe(false);
    expect(
      (await opretEkstrabillet(deps, {
        showId: SHOW.id,
        tickets: [{ ticketTypeId: "recTypeA", quantity: 1 }],
        customer: { name: "Hanne", email: "ikke-en-mail" },
      })).ok
    ).toBe(false);
  });

  it("afviser en ukendt forestilling", async () => {
    const { deps } = lavDeps();
    const svar = await opretEkstrabillet(deps, {
      showId: "recFindesIkke",
      tickets: [{ ticketTypeId: "recTypeA", quantity: 1 }],
      customer: GAEST,
    });
    expect(svar.ok).toBe(false);
  });
});

describe("advarsel ved fuld kategori", () => {
  it("advarer og opretter intet, før personalet bekræfter", async () => {
    const { deps, bookinger, betalinger, mails } = lavDeps();
    // Kategori A har loft 2 i denne forestilling. Der bestilles 3.
    const svar = await opretEkstrabillet(deps, {
      showId: SHOW.id,
      tickets: [{ ticketTypeId: "recTypeA", quantity: 3 }],
      customer: GAEST,
    });
    expect(svar.ok).toBe(false);
    if (svar.ok) return;
    expect(svar.kraeverBekraeftelse).toBe(true);
    expect(svar.detaljer?.[0]).toContain("2 tilbage");
    expect(bookinger).toHaveLength(0);
    expect(betalinger).toHaveLength(0);
    expect(mails).toHaveLength(0);
    expect((await hentTagne(db, SHOW.id)).a).toBe(0);
  });

  it("opretter alligevel, når personalet har bekræftet", async () => {
    const { deps } = lavDeps();
    const svar = await opretEkstrabillet(deps, {
      showId: SHOW.id,
      tickets: [{ ticketTypeId: "recTypeA", quantity: 3 }],
      customer: GAEST,
      bekraeftOversalg: true,
    });
    expect(svar.ok).toBe(true);
    expect((await hentTagne(db, SHOW.id)).a).toBe(3);
  });
});

describe("oprettelse", () => {
  it("opretter booking, betaling, hold og mail med betalingslink", async () => {
    const { deps, bookinger, betalinger, mails, kunder } = lavDeps();
    const svar = await opretEkstrabillet(deps, {
      showId: SHOW.id,
      tickets: [{ ticketTypeId: "recTypeA", quantity: 1 }],
      customer: GAEST,
      note: "Ringede i dag",
    });
    expect(svar.ok).toBe(true);
    if (!svar.ok) return;

    expect(svar.bookingNo).toMatch(/^BH-EKS-/);
    expect(svar.betalingslink).toContain("vivapayments");
    expect(kunder[0][FIELDS.customer.email]).toBe(GAEST.email);
    expect(bookinger[0][FIELDS.booking.status]).toBe(EKSTRA_STATUS_AFVENTER);
    expect(String(bookinger[0][FIELDS.booking.specialRequests])).toContain("Ringede i dag");

    // Samme kilde, tag og flow som et almindeligt billetkøb.
    expect(betalinger[0].sourceCode).toBe("6238");
    expect(betalinger[0].tags).toEqual(["billet", svar.bookingId]);
    expect(betalinger[0].expiresInMinutes).toBe(EKSTRA_BETALINGSFRIST_MINUTTER);
    expect(EKSTRA_BETALINGSFRIST_MINUTTER * 60).toBe(86400);

    const ledger = await getTicketPayment(db, svar.paymentRef);
    expect(ledger?.flow).toBe("billet");
    expect(ledger?.status).toBe("pending");

    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(GAEST.email);
    expect(mails[0].html).toContain("Betal dine billetter");
    expect(mails[0].html).toContain(svar.betalingslink.replace(/&/g, "&amp;"));
    expect(mails[0].html).toContain("299 kr.");
  });

  it("giver pladserne tilbage, hvis betalingen ikke kan oprettes", async () => {
    const { deps, mails } = lavDeps({
      opretBetaling: async () => {
        throw new Error("Viva nede");
      },
    });
    await expect(
      opretEkstrabillet(deps, {
        showId: SHOW.id,
        tickets: [{ ticketTypeId: "recTypeA", quantity: 1 }],
        customer: GAEST,
      })
    ).rejects.toThrow();
    expect((await hentTagne(db, SHOW.id)).a).toBe(0);
    expect(mails).toHaveLength(0);
  });
});

describe("holdetid og udløb", () => {
  it("holder pladserne i 24 timer og lidt til", async () => {
    expect(EKSTRA_HOLD_MINUTTER).toBeGreaterThan(EKSTRA_BETALINGSFRIST_MINUTTER);
    const { deps } = lavDeps();
    const svar = await opretEkstrabillet(deps, {
      showId: SHOW.id,
      tickets: [{ ticketTypeId: "recTypeA", quantity: 1 }],
      customer: GAEST,
    });
    if (!svar.ok) throw new Error("ikke oprettet");
    const { rows } = await db.query<{ minutter: number; source: string; status: string }>(
      `SELECT EXTRACT(EPOCH FROM (expires_at - created_at)) / 60 AS minutter, source, status
         FROM seat_holds WHERE payment_ref = $1`,
      [svar.paymentRef]
    );
    expect(rows[0].source).toBe("ekstra");
    expect(rows[0].status).toBe("held");
    expect(Math.round(Number(rows[0].minutter))).toBe(EKSTRA_HOLD_MINUTTER);

    // Ikke udløbet endnu: pladsen er stadig taget.
    await frigivUdloebne(db, SHOW.id);
    expect((await hentTagne(db, SHOW.id)).a).toBe(1);
  });

  it("frigiver pladserne og melder bookingen udløbet, når tiden er gået", async () => {
    const { deps } = lavDeps();
    const svar = await opretEkstrabillet(deps, {
      showId: SHOW.id,
      tickets: [{ ticketTypeId: "recTypeA", quantity: 2 }],
      customer: GAEST,
    });
    if (!svar.ok) throw new Error("ikke oprettet");
    await db.query(
      `UPDATE seat_holds SET expires_at = now() - interval '1 minute' WHERE payment_ref = $1`,
      [svar.paymentRef]
    );
    await frigivUdloebne(db, SHOW.id);
    expect((await hentTagne(db, SHOW.id)).a).toBe(0);
    expect(await udloebneEkstrabilletter(db, [svar.bookingId, "recAndenBooking"])).toEqual([
      svar.bookingId,
    ]);
  });
});

describe("betalt ekstrabillet", () => {
  async function opretOgBetal(antal: number) {
    const { deps } = lavDeps();
    const svar = await opretEkstrabillet(deps, {
      showId: SHOW.id,
      tickets: [{ ticketTypeId: "recTypeA", quantity: antal }],
      customer: GAEST,
      bekraeftOversalg: true,
    });
    if (!svar.ok) throw new Error("ikke oprettet");
    return svar;
  }

  it("tælles som solgt, også når kategorien dermed er overbooket", async () => {
    const svar = await opretOgBetal(3); // loftet for A er 2
    const betalt = await markTicketPaidByRef(db, {
      paymentRef: svar.paymentRef,
      amountOre: 3 * 29900,
      currency: "dkk",
    });
    expect(betalt.status).toBe("paid");
    const salg = await markerSolgt(db, svar.paymentRef);
    expect(salg.linjer).toBe(1);
    expect((await hentTagne(db, SHOW.id)).a).toBe(3);
    expect(await udloebneEkstrabilletter(db, [svar.bookingId])).toEqual([]);
  });

  it("en sen betaling efter udløb tager pladserne igen", async () => {
    const svar = await opretOgBetal(1);
    await db.query(
      `UPDATE seat_holds SET expires_at = now() - interval '1 minute' WHERE payment_ref = $1`,
      [svar.paymentRef]
    );
    await frigivUdloebne(db, SHOW.id);
    expect((await hentTagne(db, SHOW.id)).a).toBe(0);
    await markTicketPaidByRef(db, { paymentRef: svar.paymentRef, amountOre: 29900, currency: "dkk" });
    const salg = await markerSolgt(db, svar.paymentRef);
    expect(salg.udloebet).toBe(true);
    expect((await hentTagne(db, SHOW.id)).a).toBe(1);
  });
});

describe("webhooken behandler den som et almindeligt billetkøb", () => {
  async function opret() {
    const { deps } = lavDeps();
    const svar = await opretEkstrabillet(deps, {
      showId: SHOW.id,
      tickets: [{ ticketTypeId: "recTypeA", quantity: 1 }],
      customer: GAEST,
    });
    if (!svar.ok) throw new Error("ikke oprettet");
    return svar;
  }

  it("forkert beløb markeres ikke betalt", async () => {
    const svar = await opret();
    const r = await markTicketPaidByRef(db, { paymentRef: svar.paymentRef, amountOre: 100, currency: "dkk" });
    expect(r.status).toBe("amount_mismatch");
    expect((await getTicketPayment(db, svar.paymentRef))?.status).toBe("pending");
  });

  it("kan ikke betales to gange", async () => {
    const svar = await opret();
    const første = await markTicketPaidByRef(db, { paymentRef: svar.paymentRef, amountOre: 29900, currency: "dkk" });
    const anden = await markTicketPaidByRef(db, { paymentRef: svar.paymentRef, amountOre: 29900, currency: "dkk" });
    expect(første.status).toBe("paid");
    expect(anden.status).toBe("already_paid");
  });

  it("fejlet → betalt virker", async () => {
    const svar = await opret();
    await markTicketFailedByRef(db, svar.paymentRef);
    const r = await markTicketPaidByRef(db, { paymentRef: svar.paymentRef, amountOre: 29900, currency: "dkk" });
    expect(r.status).toBe("paid");
  });
});
