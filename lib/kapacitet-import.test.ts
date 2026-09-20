// Tests for placeringen af gamle bookinger i de fire priskategorier.
//
// Kernereglen: teksten tolkes ikke. Kategorinavnet skal ramme en billettype
// tegn for tegn, og kapacitetskategorien hentes fra billettypen. Er svaret
// ikke entydigt, placeres bookingen IKKE — den havner på ejerens liste.

import { describe, it, expect } from "vitest";
import {
  laesNedbrydning,
  placerBookinger,
  placerKategorinavn,
  type BookingTilImport,
  type OpslagsBillettype,
} from "@/lib/kapacitet-import";

const BILLETTYPER: OpslagsBillettype[] = [
  {
    id: "tk1",
    category: "A+ (1.-2.-3. række)",
    kapacitetskategori: "aplusForrest",
  },
  {
    id: "tk2",
    category: "A+ (4.-5.-6. række)",
    kapacitetskategori: "aplusBagerst",
  },
  { id: "tk3", category: "A (7.-8.-9. række)", kapacitetskategori: "a" },
  { id: "tk4", category: "B (10. række)", kapacitetskategori: "b" },
  // Samme navn i en anden prisgruppe — peger på samme kapacitetskategori.
  {
    id: "tk5",
    category: "A+ (1.-2.-3. række)",
    kapacitetskategori: "aplusForrest",
  },
  // Billettype uden udfyldt kapacitetskategori.
  { id: "tk6", category: "C (balkon)", kapacitetskategori: null },
];

function booking(overrides: Partial<BookingTilImport> = {}): BookingTilImport {
  return {
    bookingId: "recB1",
    bookingNo: "BH-1001",
    showId: "recShow1",
    ticketBreakdown: "A+ (1.-2.-3. række) x2",
    kundenavn: "Gæst",
    dato: "2027-05-20",
    ...overrides,
  };
}

describe("laesNedbrydning", () => {
  it("læser én del", () => {
    const r = laesNedbrydning("B (10. række) x1");
    expect(r.ulaeselig).toBe(false);
    expect(r.dele).toEqual([{ kategorinavn: "B (10. række)", antal: 1 }]);
  });

  it("læser flere dele adskilt af komma", () => {
    const r = laesNedbrydning("A+ (1.-2.-3. række) x2, B (10. række) x1");
    expect(r.dele).toEqual([
      { kategorinavn: "A+ (1.-2.-3. række)", antal: 2 },
      { kategorinavn: "B (10. række)", antal: 1 },
    ]);
  });

  it("markerer tom tekst som ulæselig", () => {
    expect(laesNedbrydning("").ulaeselig).toBe(true);
    expect(laesNedbrydning("   ").ulaeselig).toBe(true);
  });

  it("markerer en del uden antal som ulæselig", () => {
    expect(laesNedbrydning("B (10. række)").ulaeselig).toBe(true);
  });

  it("markerer antal nul som ulæseligt i stedet for at gætte", () => {
    expect(laesNedbrydning("B (10. række) x0").ulaeselig).toBe(true);
  });
});

describe("placerKategorinavn", () => {
  it("finder kapacitetskategorien via billettypen", () => {
    const r = placerKategorinavn("B (10. række)", BILLETTYPER);
    expect(r).toEqual({ ok: true, kategori: "b", ticketTypeId: "tk4" });
  });

  it("kræver et fuldstændigt match — ikke et delvist og ikke et med anden skrivemåde", () => {
    // Det fulde navn rammer.
    expect(placerKategorinavn("B (10. række)", BILLETTYPER).ok).toBe(true);
    // Et stykke af navnet gør ikke.
    expect(placerKategorinavn("B", BILLETTYPER).ok).toBe(false);
    expect(placerKategorinavn("B (10.", BILLETTYPER).ok).toBe(false);
    // Store og små bogstaver skal passe.
    expect(placerKategorinavn("b (10. række)", BILLETTYPER).ok).toBe(false);
    // Et navn, der blot ligner, rammer ikke.
    expect(placerKategorinavn("B (10 række)", BILLETTYPER).ok).toBe(false);
  });

  it("tåler mellemrum omkring navnet", () => {
    expect(placerKategorinavn("  B (10. række) ", BILLETTYPER).ok).toBe(true);
  });

  it("accepterer flere billettyper med samme navn, når de er enige", () => {
    const r = placerKategorinavn("A+ (1.-2.-3. række)", BILLETTYPER);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kategori).toBe("aplusForrest");
  });

  it("afviser, når to billettyper med samme navn er uenige", () => {
    const uenige: OpslagsBillettype[] = [
      { id: "x1", category: "A+", kapacitetskategori: "aplusForrest" },
      { id: "x2", category: "A+", kapacitetskategori: "aplusBagerst" },
    ];
    const r = placerKategorinavn("A+", uenige);
    expect(r).toEqual({ ok: false, fejl: "flere-modstridende-billettyper" });
  });

  it("afviser et ukendt kategorinavn", () => {
    expect(placerKategorinavn("Loge", BILLETTYPER)).toEqual({
      ok: false,
      fejl: "ukendt-kategorinavn",
    });
  });

  it("afviser en billettype uden kapacitetskategori", () => {
    expect(placerKategorinavn("C (balkon)", BILLETTYPER)).toEqual({
      ok: false,
      fejl: "billettype-uden-kapacitetskategori",
    });
  });
});

describe("placerBookinger", () => {
  it("placerer en booking, der kan læses entydigt", () => {
    const { placerede, uplacerede } = placerBookinger([booking()], BILLETTYPER);
    expect(uplacerede).toHaveLength(0);
    expect(placerede[0].oensker).toEqual([
      { kategori: "aplusForrest", antal: 2, ticketTypeId: "tk1" },
    ]);
  });

  it("placerer en booking med flere kategorier", () => {
    const { placerede } = placerBookinger(
      [booking({ ticketBreakdown: "A+ (4.-5.-6. række) x2, B (10. række) x1" })],
      BILLETTYPER
    );
    expect(placerede[0].oensker).toEqual([
      { kategori: "aplusBagerst", antal: 2, ticketTypeId: "tk2" },
      { kategori: "b", antal: 1, ticketTypeId: "tk4" },
    ]);
  });

  it("placerer INTET af en booking, hvis bare én del ikke kan placeres", () => {
    const { placerede, uplacerede } = placerBookinger(
      [booking({ ticketBreakdown: "B (10. række) x1, Loge x2" })],
      BILLETTYPER
    );
    expect(placerede).toHaveLength(0);
    expect(uplacerede).toHaveLength(1);
    expect(uplacerede[0].fejl).toBe("ukendt-kategorinavn");
    expect(uplacerede[0].detalje).toBe("Loge");
  });

  it("springer ikke en ulæselig booking stille over", () => {
    const { placerede, uplacerede } = placerBookinger(
      [booking({ ticketBreakdown: "" })],
      BILLETTYPER
    );
    expect(placerede).toHaveLength(0);
    expect(uplacerede[0].fejl).toBe("ulaeselig-nedbrydning");
  });

  it("holder de placerbare og de uplacerbare adskilt", () => {
    const { placerede, uplacerede } = placerBookinger(
      [
        booking({ bookingId: "recA", ticketBreakdown: "B (10. række) x1" }),
        booking({ bookingId: "recB", ticketBreakdown: "Loge x1" }),
        booking({ bookingId: "recC", ticketBreakdown: "A (7.-8.-9. række) x3" }),
      ],
      BILLETTYPER
    );
    expect(placerede.map((p) => p.booking.bookingId)).toEqual(["recA", "recC"]);
    expect(uplacerede.map((u) => u.booking.bookingId)).toEqual(["recB"]);
  });
});
