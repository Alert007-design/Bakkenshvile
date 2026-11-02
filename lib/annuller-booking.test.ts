// Tests for annullering af bookinger (funktion 1).
//
// Det vigtigste, der bevogtes:
//  - kun "Betalt" kan annulleres, og aldrig to gange
//  - status, note og pladser ændres i den rigtige rækkefølge
//  - pladserne frigives, også de solgte, og kun for den ene booking
//  - Vivas besked kan aldrig gøre en annulleret booking betalt igen eller
//    tage pladserne igen, heller ikke ved gentagne beskeder

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type Queryable } from "@/lib/db";
import { FIELDS } from "@/lib/airtable";
import {
  annullerBooking,
  beregnRefusion,
  erAnnulleret,
  fuldfoerKunHvisAktiv,
  noteLinje,
  tilfoejNote,
  udenAnnullerede,
  vurderAnnullering,
  type AnnullerDeps,
} from "@/lib/annuller-booking";
import { kundeBemaerkning } from "@/lib/gaesteliste";
import { annullerPladser, hentTagne, markerSolgtForBooking, registrerSalg } from "@/lib/seat-holds";
import {
  createTicketPayment,
  markTicketPaidByRef,
  revertTicketPaidByRef,
} from "@/lib/ticket-payments";

const SHOW = "recShow0000000001";
const BOOKING = "recBooking0000001";

describe("vurderAnnullering", () => {
  it("tillader en betalt booking", () => {
    expect(vurderAnnullering("Betalt")).toEqual({ ok: true });
  });
  it("afviser en allerede annulleret booking", () => {
    const r = vurderAnnullering("Annulleret");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.error).toMatch(/allerede annulleret/i);
    }
  });
  it.each(["Afventer betaling", "Udløbet", "Ekstra – afventer betaling", "", "Noget andet"])(
    "afviser status %s",
    (status) => {
      const r = vurderAnnullering(status);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(409);
    }
  );
});

describe("erAnnulleret", () => {
  it("kender status som tekst og som Airtable-objekt", () => {
    expect(erAnnulleret("Annulleret")).toBe(true);
    expect(erAnnulleret({ name: "Annulleret" })).toBe(true);
    expect(erAnnulleret("Betalt")).toBe(false);
    expect(erAnnulleret(undefined)).toBe(false);
  });
});

describe("beregnRefusion", () => {
  it("lægger betalingerne i ledgeren sammen (billet + genbestilling)", () => {
    expect(beregnRefusion({ betaltOre: [52500, 4500], betaltIAlt: 100 })).toEqual({
      kr: 570,
      kilde: "viva",
    });
  });
  it("bruger Betalt i alt, når ledgeren ikke har betalinger", () => {
    expect(beregnRefusion({ betaltOre: [], betaltIAlt: 1250 })).toEqual({ kr: 1250, kilde: "airtable" });
  });
  it("giver 0 kr. for en fribillet", () => {
    expect(beregnRefusion({ betaltOre: [], betaltIAlt: null })).toEqual({ kr: 0, kilde: "ingen" });
    expect(beregnRefusion({ betaltOre: [], betaltIAlt: 0 })).toEqual({ kr: 0, kilde: "ingen" });
  });
  it("runder øre rigtigt", () => {
    expect(beregnRefusion({ betaltOre: [12345], betaltIAlt: null }).kr).toBe(123.45);
  });
});

describe("noten", () => {
  it("skrives i dansk tid med dato og klokkeslæt", () => {
    // 12:30 UTC den 2. november 2026 er 13.30 dansk tid (vintertid).
    expect(noteLinje(new Date("2026-11-02T12:30:00Z"))).toBe(
      "Annulleret af personale 02-11-2026 kl. 13.30. Husk refusion i Viva."
    );
  });
  it("sommertid: 12:30 UTC er 14.30", () => {
    expect(noteLinje(new Date("2027-07-02T12:30:00Z"))).toContain("02-07-2027 kl. 14.30");
  });
  it("tilføjes til det, der står, og overskriver intet", () => {
    const linje = "Annulleret af personale 02-11-2026 kl. 13.30. Husk refusion i Viva.";
    expect(tilfoejNote("Show: fre 3. juli — vi sidder gerne ved vinduet", linje)).toBe(
      `Show: fre 3. juli — vi sidder gerne ved vinduet | ${linje}`
    );
  });
  it("står alene, når feltet var tomt", () => {
    expect(tilfoejNote("", "x")).toBe("x");
    expect(tilfoejNote(undefined, "x")).toBe("x");
    expect(tilfoejNote("   ", "x")).toBe("x");
  });
  it("tæller ikke som kundens egen bemærkning", () => {
    const tekst = tilfoejNote("Show: fre 3. juli", noteLinje(new Date("2026-11-02T12:30:00Z")));
    expect(kundeBemaerkning(tekst)).toBe("");
  });
  it("lader kundens egen bemærkning stå uændret ved siden af noten", () => {
    const tekst = tilfoejNote("Show: fre 3. juli — allergi", noteLinje(new Date("2026-11-02T12:30:00Z")));
    expect(kundeBemaerkning(tekst)).toBe("allergi");
  });
});

describe("udenAnnullerede (bordplan og gæsteliste)", () => {
  it("fjerner annullerede og beholder resten", () => {
    const rows = [
      { id: "1", status: "Betalt" },
      { id: "2", status: "Annulleret" },
      { id: "3", status: "Afventer betaling" },
    ];
    expect(udenAnnullerede(rows).map((r) => r.id)).toEqual(["1", "3"]);
  });
});

// --- annullerBooking med falske afhængigheder --------------------------------

function booking(fields: Record<string, unknown> = {}) {
  return {
    id: BOOKING,
    fields: {
      [FIELDS.booking.bookingNo]: "BH-K7M2Q9XR",
      [FIELDS.booking.status]: "Betalt",
      [FIELDS.booking.specialRequests]: "Show: fre 3. juli — vi sidder gerne ved vinduet",
      [FIELDS.booking.totalPaid]: 575,
      ...fields,
    },
  };
}

function deps(over: Partial<AnnullerDeps> = {}): AnnullerDeps & {
  kald: string[];
  opdateret: Record<string, unknown>[];
} {
  const kald: string[] = [];
  const opdateret: Record<string, unknown>[] = [];
  return {
    kald,
    opdateret,
    hentBooking: vi.fn(async () => booking()),
    opdaterBooking: vi.fn(async (_id, felter) => {
      kald.push("opdater");
      opdateret.push(felter);
    }),
    hentBetaltOre: vi.fn(async () => [52500, 5000]),
    frigivPladser: vi.fn(async () => {
      kald.push("frigiv");
    }),
    nu: () => new Date("2026-11-02T12:30:00Z"),
    log: vi.fn(),
    ...over,
  };
}

describe("annullerBooking", () => {
  it("sætter status og note, frigiver pladserne og svarer med beløbet", async () => {
    const d = deps();
    const r = await annullerBooking(d, BOOKING);
    expect(r).toMatchObject({ ok: true, bookingNo: "BH-K7M2Q9XR", beloebKr: 575, pladserFrigivet: true });
    expect(d.opdateret).toHaveLength(1);
    expect(d.opdateret[0][FIELDS.booking.status]).toBe("Annulleret");
    expect(d.opdateret[0][FIELDS.booking.specialRequests]).toBe(
      "Show: fre 3. juli — vi sidder gerne ved vinduet | Annulleret af personale 02-11-2026 kl. 13.30. Husk refusion i Viva."
    );
  });

  it("ændrer status først og frigiver pladserne bagefter", async () => {
    const d = deps();
    await annullerBooking(d, BOOKING);
    expect(d.kald).toEqual(["opdater", "frigiv"]);
  });

  it("rører ikke andre felter end status og noten", async () => {
    const d = deps();
    await annullerBooking(d, BOOKING);
    expect(Object.keys(d.opdateret[0]).sort()).toEqual(
      [FIELDS.booking.status, FIELDS.booking.specialRequests].sort()
    );
  });

  it("afviser en allerede annulleret booking og ændrer intet i Airtable", async () => {
    const d = deps({ hentBooking: vi.fn(async () => booking({ [FIELDS.booking.status]: "Annulleret" })) });
    const r = await annullerBooking(d, BOOKING);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(d.opdaterBooking).not.toHaveBeenCalled();
  });

  it("forsøger ved en gentagelse at frigive pladser, der blev hængende (skadesløst)", async () => {
    const d = deps({ hentBooking: vi.fn(async () => booking({ [FIELDS.booking.status]: "Annulleret" })) });
    await annullerBooking(d, BOOKING);
    expect(d.frigivPladser).toHaveBeenCalledTimes(1);
  });

  it("fortæller ved en gentagelse, om pladserne nu er frigivet", async () => {
    const annulleret = vi.fn(async () => booking({ [FIELDS.booking.status]: "Annulleret" }));
    const ok = await annullerBooking(deps({ hentBooking: annulleret }), BOOKING);
    expect(ok).toMatchObject({ ok: false, status: 409, pladserFrigivet: true });
    const fejler = await annullerBooking(
      deps({
        hentBooking: annulleret,
        frigivPladser: vi.fn(async () => {
          throw new Error("database nede");
        }),
      }),
      BOOKING
    );
    expect(fejler).toMatchObject({ ok: false, status: 409, pladserFrigivet: false });
  });

  it("afviser en ubetalt booking uden at røre noget", async () => {
    const d = deps({ hentBooking: vi.fn(async () => booking({ [FIELDS.booking.status]: "Afventer betaling" })) });
    const r = await annullerBooking(d, BOOKING);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(d.opdaterBooking).not.toHaveBeenCalled();
    expect(d.frigivPladser).not.toHaveBeenCalled();
  });

  it("svarer 404, når bookingen ikke findes", async () => {
    const d = deps({ hentBooking: vi.fn(async () => null) });
    const r = await annullerBooking(d, BOOKING);
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(d.opdaterBooking).not.toHaveBeenCalled();
  });

  it("frigiver IKKE pladserne, hvis Airtable ikke kunne opdateres", async () => {
    const d = deps({
      opdaterBooking: vi.fn(async () => {
        throw new Error("Airtable nede");
      }),
    });
    const r = await annullerBooking(d, BOOKING);
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(d.frigivPladser).not.toHaveBeenCalled();
  });

  it("melder tydeligt, hvis pladserne ikke kunne frigives efter annulleringen", async () => {
    const d = deps({
      frigivPladser: vi.fn(async () => {
        throw new Error("database nede");
      }),
    });
    const r = await annullerBooking(d, BOOKING);
    expect(r).toMatchObject({ ok: true, pladserFrigivet: false, beloebKr: 575 });
    expect(d.log).toHaveBeenCalled();
  });

  it("bruger Betalt i alt, hvis ledgeren ikke kan læses", async () => {
    const d = deps({
      hentBetaltOre: vi.fn(async () => {
        throw new Error("database nede");
      }),
    });
    const r = await annullerBooking(d, BOOKING);
    expect(r).toMatchObject({ ok: true, beloebKr: 575 });
  });

  it("logger uden navne og mails", async () => {
    const d = deps();
    await annullerBooking(d, BOOKING);
    const alt = JSON.stringify((d.log as ReturnType<typeof vi.fn>).mock.calls);
    expect(alt).not.toMatch(/@/);
    expect(alt).toContain("BH-K7M2Q9XR");
  });
});

// --- Pladsbogen -------------------------------------------------------------

let db: Queryable & { query: PGlite["query"] };

beforeAll(async () => {
  db = new PGlite() as unknown as Queryable & { query: PGlite["query"] };
  await applyMigrations(db);
});

beforeEach(async () => {
  await db.query("TRUNCATE seat_holds, seat_counters, ticket_payments");
});

async function solgt(bookingId: string, oensker: { kategori: "aplusForrest" | "a" | "b"; antal: number }[]) {
  await registrerSalg(db, { showId: SHOW, bookingId, oensker, kilde: "fribillet" });
}

describe("annullerPladser", () => {
  it("frigiver solgte pladser, så de kan sælges igen", async () => {
    await solgt(BOOKING, [{ kategori: "a", antal: 2 }, { kategori: "b", antal: 1 }]);
    expect((await hentTagne(db, SHOW)).a).toBe(2);
    await annullerPladser(db, BOOKING);
    const tagne = await hentTagne(db, SHOW);
    expect(tagne.a).toBe(0);
    expect(tagne.b).toBe(0);
  });

  it("rører kun den ene booking", async () => {
    await solgt(BOOKING, [{ kategori: "a", antal: 2 }]);
    await solgt("recAndenBooking01", [{ kategori: "a", antal: 3 }]);
    await annullerPladser(db, BOOKING);
    expect((await hentTagne(db, SHOW)).a).toBe(3);
  });

  it("kan gentages uden at trække tallene under det rigtige", async () => {
    await solgt(BOOKING, [{ kategori: "a", antal: 2 }]);
    await solgt("recAndenBooking01", [{ kategori: "a", antal: 3 }]);
    await annullerPladser(db, BOOKING);
    await annullerPladser(db, BOOKING);
    expect((await hentTagne(db, SHOW)).a).toBe(3);
  });

  it("sletter ingen linjer, kun markerer dem som givet tilbage", async () => {
    await solgt(BOOKING, [{ kategori: "b", antal: 1 }]);
    await annullerPladser(db, BOOKING);
    const { rows } = await db.query<{ status: string }>(`SELECT status FROM seat_holds WHERE booking_id = $1`, [BOOKING]);
    expect(rows.map((r) => r.status)).toEqual(["released"]);
  });
});

// --- Viva-beskeden efter en annullering -------------------------------------

function betaling(ref = "1234567890123456") {
  return {
    paymentRef: ref,
    flow: "billet" as const,
    bookingId: BOOKING,
    bookingNo: "BH-K7M2Q9XR",
    customerEmail: "gaest@eksempel.dk",
    customerName: "Test Gæst",
    expectedTotalOre: 52500,
    lineItems: [{ description: "Billet", quantity: 2, amountSubtotalOre: 52500 }],
  };
}
const VIVA = { paymentRef: "1234567890123456", amountOre: 52500, currency: "dkk" };

describe("Viva-beskeden efter en annullering", () => {
  it("samme besked to gange behandles kun første gang (allerede betalt)", async () => {
    await createTicketPayment(db, betaling());
    expect((await markTicketPaidByRef(db, VIVA)).status).toBe("paid");
    expect((await markTicketPaidByRef(db, VIVA)).status).toBe("already_paid");
    expect((await markTicketPaidByRef(db, VIVA)).status).toBe("already_paid");
  });

  it("en genforsøgt besked kan vinde igen, hvis første forsøg blev rullet tilbage", async () => {
    // Det er netop den vej, værnet i fuldfoerKunHvisAktiv skal lukke.
    await createTicketPayment(db, betaling());
    await markTicketPaidByRef(db, VIVA);
    await revertTicketPaidByRef(db, VIVA.paymentRef);
    expect((await markTicketPaidByRef(db, VIVA)).status).toBe("paid");
  });

  it("ændrer ikke en annulleret booking og tager ikke pladserne igen", async () => {
    // 1. Bookingen er betalt og solgt, så annulleres den og pladserne frigives.
    await db.query(
      `INSERT INTO seat_holds (show_id, booking_id, category, quantity, status, source, payment_ref)
       VALUES ($1, $2, 'a', 2, 'sold', 'checkout', '1234567890123456')`,
      [SHOW, BOOKING]
    );
    await db.query(
      `INSERT INTO seat_counters (show_id, taken_a) VALUES ($1, 2)`,
      [SHOW]
    );
    await annullerPladser(db, BOOKING);
    expect((await hentTagne(db, SHOW)).a).toBe(0);

    // 2. Viva sender beskeden igen, og webhooken ville fuldføre betalingen.
    const opdaterBooking = vi.fn();
    const tagPladserIgen = vi.fn(async () => markerSolgtForBooking(db, BOOKING));
    const svar = await fuldfoerKunHvisAktiv(
      async () => "Annulleret",
      async () => {
        opdaterBooking();
        await tagPladserIgen();
      }
    );

    expect(svar).toEqual({ udfoert: false });
    expect(opdaterBooking).not.toHaveBeenCalled();
    expect(tagPladserIgen).not.toHaveBeenCalled();
    expect((await hentTagne(db, SHOW)).a).toBe(0);
  });

  it("uden værnet ville pladserne være blevet taget igen (beviser, at værnet er nødvendigt)", async () => {
    await db.query(
      `INSERT INTO seat_holds (show_id, booking_id, category, quantity, status, source, payment_ref)
       VALUES ($1, $2, 'a', 2, 'sold', 'checkout', '1234567890123456')`,
      [SHOW, BOOKING]
    );
    await db.query(`INSERT INTO seat_counters (show_id, taken_a) VALUES ($1, 2)`, [SHOW]);
    await annullerPladser(db, BOOKING);
    await markerSolgtForBooking(db, BOOKING);
    expect((await hentTagne(db, SHOW)).a).toBe(2);
  });

  it("fuldfører betalingen som normalt for en betalt booking", async () => {
    const fuldfoer = vi.fn(async () => "ok");
    const svar = await fuldfoerKunHvisAktiv(async () => "Betalt", fuldfoer);
    expect(svar).toEqual({ udfoert: true, resultat: "ok" });
    expect(fuldfoer).toHaveBeenCalledTimes(1);
  });

  it("fuldfører også for en booking, der venter på betaling (almindeligt køb)", async () => {
    const fuldfoer = vi.fn(async () => "ok");
    const svar = await fuldfoerKunHvisAktiv(async () => "Afventer betaling", fuldfoer);
    expect(svar.udfoert).toBe(true);
  });

  it("kan statussen ikke læses, kastes der, så webhooken svarer 500 og Viva prøver igen", async () => {
    const fuldfoer = vi.fn();
    await expect(
      fuldfoerKunHvisAktiv(async () => {
        throw new Error("Airtable nede");
      }, fuldfoer)
    ).rejects.toThrow();
    expect(fuldfoer).not.toHaveBeenCalled();
  });
});
