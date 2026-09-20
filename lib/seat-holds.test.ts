// Tests for pladsbogen: reservationer, udløb, salg og frigivelse.
//
// Det vigtigste, der bevogtes her, er værnet mod oversalg:
//  - en bestilling på tværs af flere kategorier er alt-eller-intet
//  - to køb af den sidste plads: præcis ét lykkes
//  - en reservation, der udløber, giver pladserne tilbage
//  - en betaling, der kommer efter udløbet, giver stadig billetten
//  - samme betaling to gange tælles kun én gang
//  - fribilletter tæller med og må gerne overstige loftet
//  - importen af gamle bookinger kan køres to gange uden at tælle dobbelt

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type Queryable } from "@/lib/db";
import { STANDARD_KAPACITET, type Kapacitetskategori } from "@/lib/kapacitet";
import {
  frigivForBooking,
  frigivReservation,
  frigivUdloebne,
  genberegnTagne,
  hentHoldsForBetaling,
  hentTagne,
  markerSolgt,
  registrerSalg,
  reserverPladser,
} from "@/lib/seat-holds";

let db: Queryable & { query: PGlite["query"] };

const SHOW = "recShow0000000001";

/** Lille kapacitet, så loftet er let at ramme i en test. */
const SMAA_LOFTER: Record<Kapacitetskategori, number> = {
  aplusForrest: 4,
  aplusBagerst: 4,
  a: 2,
  b: 1,
};

async function reserver(
  bookingId: string,
  oensker: { kategori: Kapacitetskategori; antal: number }[],
  opts: { kapaciteter?: Record<Kapacitetskategori, number>; minutter?: number } = {}
) {
  return reserverPladser(db, {
    showId: SHOW,
    bookingId,
    oensker,
    kapaciteter: opts.kapaciteter ?? SMAA_LOFTER,
    holdMinutter: opts.minutter ?? 20,
    kilde: "checkout",
  });
}

/** Sætter en reservations udløb tilbage i tiden, så den tæller som udløbet. */
async function laadSomUdloebet(bookingId: string) {
  await db.query(
    `UPDATE seat_holds SET expires_at = now() - interval '1 minute' WHERE booking_id = $1`,
    [bookingId]
  );
}

beforeAll(async () => {
  db = new PGlite() as unknown as Queryable & { query: PGlite["query"] };
  await applyMigrations(db);
});

beforeEach(async () => {
  await db.query("TRUNCATE seat_holds, seat_counters");
});

describe("migration 005", () => {
  it("opretter begge tabeller", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
    );
    const navne = rows.map((r) => r.table_name);
    expect(navne).toContain("seat_counters");
    expect(navne).toContain("seat_holds");
  });

  it("tillader kun én linje pr. booking pr. kategori — på tværs af alle kilder", async () => {
    await db.query(
      `INSERT INTO seat_holds (show_id, booking_id, category, quantity, status, source)
       VALUES ($1, 'recB1', 'b', 1, 'sold', 'checkout')`,
      [SHOW]
    );
    await expect(
      db.query(
        `INSERT INTO seat_holds (show_id, booking_id, category, quantity, status, source)
         VALUES ($1, 'recB1', 'b', 1, 'sold', 'import')`,
        [SHOW]
      )
    ).rejects.toThrow();
  });
});

describe("reservation", () => {
  it("reserverer og tæller pladserne som taget", async () => {
    const r = await reserver("recB1", [{ kategori: "b", antal: 1 }]);
    expect(r.ok).toBe(true);
    expect((await hentTagne(db, SHOW)).b).toBe(1);
  });

  it("reserverer flere kategorier i samme bestilling", async () => {
    const r = await reserver("recB1", [
      { kategori: "aplusForrest", antal: 2 },
      { kategori: "b", antal: 1 },
    ]);
    expect(r.ok).toBe(true);
    const tagne = await hentTagne(db, SHOW);
    expect(tagne.aplusForrest).toBe(2);
    expect(tagne.b).toBe(1);
  });

  it("afviser, når der ikke er nok tilbage, og rører ikke tallene", async () => {
    await reserver("recB1", [{ kategori: "a", antal: 2 }]);
    const r = await reserver("recB2", [{ kategori: "a", antal: 1 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.mangler.kategori).toBe("a");
      expect(r.tilbage.a).toBe(0);
    }
    expect((await hentTagne(db, SHOW)).a).toBe(2);
  });

  it("er alt-eller-intet på tværs af kategorier", async () => {
    // B er fyldt op. Bestillingen vil have både A+ og B — så må INTET reserveres.
    await reserver("recB1", [{ kategori: "b", antal: 1 }]);
    const r = await reserver("recB2", [
      { kategori: "aplusForrest", antal: 2 },
      { kategori: "b", antal: 1 },
    ]);
    expect(r.ok).toBe(false);
    const tagne = await hentTagne(db, SHOW);
    expect(tagne.aplusForrest).toBe(0); // ingen halv reservation
    expect(tagne.b).toBe(1);
    const { rows } = await db.query(
      `SELECT * FROM seat_holds WHERE booking_id = 'recB2'`
    );
    expect(rows).toHaveLength(0);
  });

  it("må fylde kategorien præcis op", async () => {
    const r = await reserver("recB1", [{ kategori: "a", antal: 2 }]);
    expect(r.ok).toBe(true);
    expect((await hentTagne(db, SHOW)).a).toBe(2);
  });

  it("to køb af den sidste plads: præcis ét lykkes", async () => {
    // Pglite har kun én forbindelse, så de to kald kan ikke køre bogstaveligt
    // samtidig. Det, testen viser, er selve spærren: den anden reservation
    // prøves mod de NYE tal og bliver afvist. I produktion er det Postgres'
    // laas paa raekken, der tvinger den rækkefølge frem.
    const [en, to] = await Promise.all([
      reserver("recB1", [{ kategori: "b", antal: 1 }]),
      reserver("recB2", [{ kategori: "b", antal: 1 }]),
    ]);
    expect([en.ok, to.ok].filter(Boolean)).toHaveLength(1);
    expect((await hentTagne(db, SHOW)).b).toBe(1);
  });

  it("afviser et ønske om flere end hele kategorien", async () => {
    const r = await reserver("recB1", [{ kategori: "b", antal: 2 }]);
    expect(r.ok).toBe(false);
    expect((await hentTagne(db, SHOW)).b).toBe(0);
  });

  it("gemmer billettypens id, så teksten aldrig skal tolkes senere", async () => {
    await reserverPladser(db, {
      showId: SHOW,
      bookingId: "recB1",
      oensker: [{ kategori: "b", antal: 1, ticketTypeId: "recType01" }],
      kapaciteter: SMAA_LOFTER,
      holdMinutter: 20,
      kilde: "checkout",
    });
    const { rows } = await db.query<{ ticket_type_id: string }>(
      `SELECT ticket_type_id FROM seat_holds WHERE booking_id = 'recB1'`
    );
    expect(rows[0].ticket_type_id).toBe("recType01");
  });

  it("bruger standardkapaciteten, når den sendes med", async () => {
    const r = await reserver("recB1", [{ kategori: "aplusBagerst", antal: 60 }], {
      kapaciteter: STANDARD_KAPACITET,
    });
    expect(r.ok).toBe(true);
    expect((await hentTagne(db, SHOW)).aplusBagerst).toBe(60);
  });
});

describe("udløb af reservationer", () => {
  it("giver pladserne tilbage, når reservationen er udløbet", async () => {
    await reserver("recB1", [{ kategori: "b", antal: 1 }]);
    await laadSomUdloebet("recB1");
    await frigivUdloebne(db, SHOW);
    expect((await hentTagne(db, SHOW)).b).toBe(0);
  });

  it("frigør en udløbet plads, så den kan sælges til en anden", async () => {
    await reserver("recB1", [{ kategori: "b", antal: 1 }]);
    await laadSomUdloebet("recB1");
    await frigivUdloebne(db, SHOW);
    const r = await reserver("recB2", [{ kategori: "b", antal: 1 }]);
    expect(r.ok).toBe(true);
  });

  it("rører ikke reservationer, der stadig er i live", async () => {
    await reserver("recB1", [{ kategori: "b", antal: 1 }]);
    await frigivUdloebne(db, SHOW);
    expect((await hentTagne(db, SHOW)).b).toBe(1);
  });

  it("rører ikke solgte pladser, uanset hvor gamle de er", async () => {
    await reserver("recB1", [{ kategori: "b", antal: 1 }], { minutter: 20 });
    await db.query(
      `UPDATE seat_holds SET payment_ref = 'REF1' WHERE booking_id = 'recB1'`
    );
    await markerSolgt(db, "REF1");
    await laadSomUdloebet("recB1");
    await frigivUdloebne(db, SHOW);
    expect((await hentTagne(db, SHOW)).b).toBe(1);
  });

  it("kan køres to gange uden at tælle for meget ned", async () => {
    await reserver("recB1", [{ kategori: "a", antal: 2 }]);
    await laadSomUdloebet("recB1");
    await frigivUdloebne(db, SHOW);
    await frigivUdloebne(db, SHOW);
    expect((await hentTagne(db, SHOW)).a).toBe(0);
  });
});

describe("betaling", () => {
  async function reserverMedRef(bookingId: string, ref: string, antal = 1) {
    await reserverPladser(db, {
      showId: SHOW,
      bookingId,
      oensker: [{ kategori: "b", antal }],
      kapaciteter: SMAA_LOFTER,
      holdMinutter: 20,
      kilde: "checkout",
      paymentRef: ref,
    });
  }

  it("gør reservationen til et endeligt salg uden at ændre tallene", async () => {
    await reserverMedRef("recB1", "REF1");
    const r = await markerSolgt(db, "REF1");
    expect(r.linjer).toBe(1);
    expect(r.udloebet).toBe(false);
    expect((await hentTagne(db, SHOW)).b).toBe(1);
    const hold = await hentHoldsForBetaling(db, "REF1");
    expect(hold[0].status).toBe("sold");
  });

  it("samme betaling to gange tælles kun én gang", async () => {
    await reserverMedRef("recB1", "REF1");
    await markerSolgt(db, "REF1");
    const anden = await markerSolgt(db, "REF1");
    expect(anden.linjer).toBe(0);
    expect((await hentTagne(db, SHOW)).b).toBe(1);
  });

  it("en betaling efter udløbet reservation giver stadig billetten", async () => {
    await reserverMedRef("recB1", "REF1");
    await laadSomUdloebet("recB1");
    await frigivUdloebne(db, SHOW);
    expect((await hentTagne(db, SHOW)).b).toBe(0);

    const r = await markerSolgt(db, "REF1");
    expect(r.linjer).toBe(1);
    expect(r.udloebet).toBe(true);
    // Pladsen tages igen, saa tallene stemmer med virkeligheden.
    expect((await hentTagne(db, SHOW)).b).toBe(1);
    const hold = await hentHoldsForBetaling(db, "REF1");
    expect(hold[0].status).toBe("sold");
  });

  it("en sen betaling kan gøre kategorien oversolgt — og det kan ses", async () => {
    await reserverMedRef("recB1", "REF1");
    await laadSomUdloebet("recB1");
    await frigivUdloebne(db, SHOW);
    // Imens nåede en anden at købe den sidste B-plads.
    await reserver("recB2", [{ kategori: "b", antal: 1 }]);

    const r = await markerSolgt(db, "REF1");
    expect(r.udloebet).toBe(true);
    expect((await hentTagne(db, SHOW)).b).toBe(2); // loftet er 1
  });

  it("en ukendt betalingsreference ændrer ingenting", async () => {
    const r = await markerSolgt(db, "FINDES-IKKE");
    expect(r.linjer).toBe(0);
    expect(r.showId).toBeNull();
  });

  it("frigiver pladserne, når betalingen fejler", async () => {
    await reserverMedRef("recB1", "REF1");
    await frigivReservation(db, "REF1");
    expect((await hentTagne(db, SHOW)).b).toBe(0);
  });

  it("frigivelse to gange tæller ikke dobbelt ned", async () => {
    await reserverMedRef("recB1", "REF1", 1);
    await frigivReservation(db, "REF1");
    await frigivReservation(db, "REF1");
    expect((await hentTagne(db, SHOW)).b).toBe(0);
  });

  it("frigiver ikke en plads, der allerede er solgt", async () => {
    await reserverMedRef("recB1", "REF1");
    await markerSolgt(db, "REF1");
    await frigivReservation(db, "REF1");
    expect((await hentTagne(db, SHOW)).b).toBe(1);
  });
});

describe("fribilletter og import", () => {
  it("fribilletter tæller med i de optagne pladser", async () => {
    await registrerSalg(db, {
      showId: SHOW,
      bookingId: "recFri1",
      oensker: [{ kategori: "a", antal: 2 }],
      kilde: "fribillet",
    });
    expect((await hentTagne(db, SHOW)).a).toBe(2);
  });

  it("en fribillet må gives, selv om kategorien er fuld", async () => {
    await reserver("recB1", [{ kategori: "b", antal: 1 }]); // loftet er 1
    const r = await registrerSalg(db, {
      showId: SHOW,
      bookingId: "recFri1",
      oensker: [{ kategori: "b", antal: 1 }],
      kilde: "fribillet",
    });
    expect(r.registreret).toBe(1);
    expect((await hentTagne(db, SHOW)).b).toBe(2);
  });

  it("importen kan køres to gange uden at tælle dobbelt", async () => {
    const indhold = {
      showId: SHOW,
      bookingId: "recGammel1",
      oensker: [{ kategori: "a" as Kapacitetskategori, antal: 2 }],
      kilde: "import" as const,
    };
    const foerste = await registrerSalg(db, indhold);
    const anden = await registrerSalg(db, indhold);
    expect(foerste.registreret).toBe(1);
    expect(anden.registreret).toBe(0);
    expect((await hentTagne(db, SHOW)).a).toBe(2);
  });

  it("importen tæller ikke en booking, der allerede er registreret via købsflowet", async () => {
    await reserver("recB1", [{ kategori: "a", antal: 2 }]);
    const r = await registrerSalg(db, {
      showId: SHOW,
      bookingId: "recB1",
      oensker: [{ kategori: "a", antal: 2 }],
      kilde: "import",
    });
    expect(r.registreret).toBe(0);
    expect((await hentTagne(db, SHOW)).a).toBe(2);
  });
});

describe("genberegnTagne", () => {
  it("stemmer med pladsbogens tal, når alt er gået rigtigt til", async () => {
    await reserver("recB1", [
      { kategori: "aplusForrest", antal: 2 },
      { kategori: "b", antal: 1 },
    ]);
    await registrerSalg(db, {
      showId: SHOW,
      bookingId: "recFri1",
      oensker: [{ kategori: "a", antal: 1 }],
      kilde: "fribillet",
    });
    expect(await genberegnTagne(db, SHOW)).toEqual(await hentTagne(db, SHOW));
  });

  it("tæller hverken frigivne reservationer med", async () => {
    await reserver("recB1", [{ kategori: "b", antal: 1 }]);
    await laadSomUdloebet("recB1");
    await frigivUdloebne(db, SHOW);
    expect((await genberegnTagne(db, SHOW)).b).toBe(0);
  });
});

describe("hentTagne", () => {
  it("giver nul for en forestilling, der aldrig har solgt noget", async () => {
    expect(await hentTagne(db, "recUkendt")).toEqual({
      aplusForrest: 0,
      aplusBagerst: 0,
      a: 0,
      b: 0,
    });
  });
});

describe("frigivForBooking", () => {
  it("giver pladserne tilbage, når betalingen aldrig nåede at blive oprettet", async () => {
    await reserver("recB1", [{ kategori: "a", antal: 2 }]);
    await frigivForBooking(db, "recB1");
    expect((await hentTagne(db, SHOW)).a).toBe(0);
  });

  it("rører ikke en plads, der allerede er solgt", async () => {
    await registrerSalg(db, {
      showId: SHOW,
      bookingId: "recFri1",
      oensker: [{ kategori: "a", antal: 1 }],
      kilde: "fribillet",
    });
    await frigivForBooking(db, "recFri1");
    expect((await hentTagne(db, SHOW)).a).toBe(1);
  });
});
