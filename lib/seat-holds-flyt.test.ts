// Tests for flytning af en bookings pladser fra én forestilling til en anden.
//
// Det vigtigste, der bevogtes:
//  - alt-eller-intet: mangler der plads i én kategori, flyttes intet
//  - tællerne på begge forestillinger og linjerne er enige bagefter
//  - kun den ene bookings linjer flyttes
//  - en flytning kan føres tilbage (bruges, hvis Airtable fejler)

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type Queryable } from "@/lib/db";
import { STANDARD_KAPACITET, type Kapacitetskategori } from "@/lib/kapacitet";
import {
  flytPladser,
  genberegnTagne,
  hentPladslinjer,
  hentTagne,
  registrerSalg,
} from "@/lib/seat-holds";

let db: Queryable & { query: PGlite["query"] };

const FRA = "recShowFra0000001";
const TIL = "recShowTil0000001";
const B1 = "recBooking0000001";
const B2 = "recBooking0000002";

const LOFT: Record<Kapacitetskategori, number> = { aplusForrest: 4, aplusBagerst: 4, a: 3, b: 2 };

beforeAll(async () => {
  db = new PGlite() as unknown as Queryable & { query: PGlite["query"] };
  await applyMigrations(db);
});

beforeEach(async () => {
  await db.query("TRUNCATE seat_holds, seat_counters");
  await registrerSalg(db, {
    showId: FRA,
    bookingId: B1,
    oensker: [
      { kategori: "a", antal: 2, ticketTypeId: "recTypeA2026" },
      { kategori: "b", antal: 1, ticketTypeId: "recTypeB2026" },
    ],
    kilde: "import",
  });
  await registrerSalg(db, { showId: FRA, bookingId: B2, oensker: [{ kategori: "a", antal: 1 }], kilde: "import" });
});

describe("hentPladslinjer", () => {
  it("giver bookingens aktive linjer på forestillingen", async () => {
    const linjer = await hentPladslinjer(db, B1);
    expect(linjer).toEqual(
      expect.arrayContaining([
        { showId: FRA, kategori: "a", antal: 2, kilde: "import", ticketTypeId: "recTypeA2026" },
        { showId: FRA, kategori: "b", antal: 1, kilde: "import", ticketTypeId: "recTypeB2026" },
      ])
    );
    expect(linjer).toHaveLength(2);
  });
});

describe("flytPladser", () => {
  it("flytter pladserne og retter tællerne på begge forestillinger", async () => {
    const svar = await flytPladser(db, {
      bookingId: B1,
      fraShowId: FRA,
      tilShowId: TIL,
      kapaciteter: LOFT,
      nyeBilletTyper: { a: "recTypeA2027", b: "recTypeB2027" },
    });
    expect(svar).toEqual({ ok: true, flyttet: 3 });
    expect(await hentTagne(db, FRA)).toMatchObject({ a: 1, b: 0 });
    expect(await hentTagne(db, TIL)).toMatchObject({ a: 2, b: 1 });
    expect(await genberegnTagne(db, FRA)).toMatchObject({ a: 1, b: 0 });
    expect(await genberegnTagne(db, TIL)).toMatchObject({ a: 2, b: 1 });
    const linjer = await hentPladslinjer(db, B1);
    expect(linjer.every((l) => l.showId === TIL)).toBe(true);
    expect(linjer.find((l) => l.kategori === "a")?.ticketTypeId).toBe("recTypeA2027");
  });

  it("flytter intet, når der mangler plads i én af kategorierne", async () => {
    await registrerSalg(db, { showId: TIL, bookingId: "recAnden00000001", oensker: [{ kategori: "b", antal: 2 }], kilde: "import" });
    const svar = await flytPladser(db, {
      bookingId: B1,
      fraShowId: FRA,
      tilShowId: TIL,
      kapaciteter: LOFT,
    });
    expect(svar.ok).toBe(false);
    if (!svar.ok) expect(svar.mangler).toEqual({ kategori: "b", oensket: 1, tilbage: 0 });
    expect(await hentTagne(db, FRA)).toMatchObject({ a: 3, b: 1 });
    expect(await hentTagne(db, TIL)).toMatchObject({ a: 0, b: 2 });
    expect((await hentPladslinjer(db, B1)).every((l) => l.showId === FRA)).toBe(true);
  });

  it("afviser en booking uden pladser i pladsbogen", async () => {
    const svar = await flytPladser(db, {
      bookingId: "recIngen000000001",
      fraShowId: FRA,
      tilShowId: TIL,
      kapaciteter: LOFT,
    });
    expect(svar).toMatchObject({ ok: false, ingenPladser: true });
    expect(await hentTagne(db, TIL)).toMatchObject({ a: 0, b: 0 });
  });

  it("kan føres tilbage uden loft", async () => {
    await flytPladser(db, { bookingId: B1, fraShowId: FRA, tilShowId: TIL, kapaciteter: LOFT });
    // Den gamle forestilling er blevet fyldt op i mellemtiden.
    await registrerSalg(db, { showId: FRA, bookingId: "recAnden00000002", oensker: [{ kategori: "a", antal: 3 }], kilde: "import" });
    const svar = await flytPladser(db, {
      bookingId: B1,
      fraShowId: TIL,
      tilShowId: FRA,
      kapaciteter: null,
      nyeBilletTyper: { a: "recTypeA2026", b: "recTypeB2026" },
    });
    expect(svar.ok).toBe(true);
    expect(await hentTagne(db, FRA)).toMatchObject({ a: 6, b: 1 });
    expect(await hentTagne(db, TIL)).toMatchObject({ a: 0, b: 0 });
  });

  it("afviser at flytte til den samme forestilling", async () => {
    const svar = await flytPladser(db, { bookingId: B1, fraShowId: FRA, tilShowId: FRA, kapaciteter: STANDARD_KAPACITET });
    expect(svar.ok).toBe(false);
    expect(await hentTagne(db, FRA)).toMatchObject({ a: 3, b: 1 });
  });
});
