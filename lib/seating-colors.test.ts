// Tests for pladsoversigtens farver.
//
// Den vigtigste regel er læsbarhed: hver kategorifarve skal kunne ses tydeligt
// mod salens mørkeblå baggrund. Før denne ændring havde B (10. række) et
// kontrastforhold på ca. 2,3:1 og forsvandt nærmest i baggrunden. Testen her
// regner kontrasten ud efter WCAG's formel og fejler, hvis en farve falder
// under 3:1 — så kan problemet ikke snige sig ind igen.

import { describe, it, expect } from "vitest";
import {
  FARVEFORKLARING,
  KATEGORI_FARVER,
  SAL_BAGGRUND,
  STOLPE_FARVE,
  type Pladskategori,
} from "@/lib/seating-colors";

/** "#rrggbb" → [r, g, b] i 0-255. */
function tilRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Ikke en gyldig farve: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** Relativ luminans efter WCAG 2.1. */
function luminans(hex: string): number {
  const [r, g, b] = tilRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrastforhold mellem to farver, fra 1:1 (ens) til 21:1 (sort/hvid). */
function kontrast(a: string, b: string): number {
  const la = luminans(a);
  const lb = luminans(b);
  const lys = Math.max(la, lb);
  const moerk = Math.min(la, lb);
  return (lys + 0.05) / (moerk + 0.05);
}

/** Farvetone i grader (0-360) — bruges til at se, om to farver er i familie. */
function farvetone(hex: string): number {
  const [r, g, b] = tilRgb(hex).map((v) => v / 255);
  const maks = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = maks - min;
  if (d === 0) return 0;
  let h: number;
  if (maks === r) h = ((g - b) / d) % 6;
  else if (maks === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

const KATEGORIER = Object.keys(KATEGORI_FARVER) as Pladskategori[];

describe("hjælpefunktionerne i testen selv", () => {
  it("regner kendte kontrastforhold rigtigt", () => {
    expect(kontrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(kontrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("bekræfter, at den gamle B-farve var for mørk", () => {
    // #4E5F73 var B (10. række) før ændringen — under kravet på 3:1.
    expect(kontrast("#4E5F73", SAL_BAGGRUND)).toBeLessThan(3);
  });
});

describe("kategorifarverne mod salens baggrund", () => {
  it("dækker præcis de fire priskategorier", () => {
    expect(KATEGORIER.sort()).toEqual(
      ["a", "aplusBagerst", "aplusForrest", "b"].sort()
    );
  });

  for (const kategori of KATEGORIER) {
    it(`${kategori} har mindst 3:1 i kontrast`, () => {
      expect(kontrast(KATEGORI_FARVER[kategori], SAL_BAGGRUND)).toBeGreaterThanOrEqual(3);
    });
  }

  it("stolpefarven har også mindst 3:1", () => {
    expect(kontrast(STOLPE_FARVE, SAL_BAGGRUND)).toBeGreaterThanOrEqual(3);
  });

  it("ingen kategorifarve er mørkere end baggrunden", () => {
    for (const kategori of KATEGORIER) {
      expect(luminans(KATEGORI_FARVER[kategori])).toBeGreaterThan(
        luminans(SAL_BAGGRUND)
      );
    }
  });
});

describe("kategorifarverne indbyrdes", () => {
  it("er fire forskellige farver", () => {
    const unikke = new Set(KATEGORIER.map((k) => KATEGORI_FARVER[k]));
    expect(unikke.size).toBe(4);
  });

  // To farver må ikke kunne forveksles. Enten skal de ligge tydeligt fra
  // hinanden i farvetone (mindst 25 grader), eller også skal den ene være
  // markant lysere end den anden (mindst 1,8:1).
  it("kan skelnes parvis på enten farvetone eller lyshed", () => {
    for (let i = 0; i < KATEGORIER.length; i++) {
      for (let j = i + 1; j < KATEGORIER.length; j++) {
        const en = KATEGORI_FARVER[KATEGORIER[i]];
        const to = KATEGORI_FARVER[KATEGORIER[j]];
        const toneforskel = Math.abs(farvetone(en) - farvetone(to));
        const adskilt =
          Math.min(toneforskel, 360 - toneforskel) >= 25 || kontrast(en, to) >= 1.8;
        expect(
          adskilt,
          `${KATEGORIER[i]} (${en}) og ${KATEGORIER[j]} (${to}) ligner hinanden for meget`
        ).toBe(true);
      }
    }
  });

  it("stolpen er grå og skiller sig ud fra alle kategorier", () => {
    const [r, g, b] = tilRgb(STOLPE_FARVE);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});

describe("farveforklaringen", () => {
  it("nævner alle fire kategorier plus stolpen — i den rækkefølge, salen læses", () => {
    expect(FARVEFORKLARING.map((f) => f.noegle)).toEqual([
      "aplusForrest",
      "aplusBagerst",
      "a",
      "b",
      "stolpe",
    ]);
  });

  it("henter farverne fra den samme kilde som sæderne", () => {
    for (const post of FARVEFORKLARING) {
      const forventet =
        post.noegle === "stolpe"
          ? STOLPE_FARVE
          : KATEGORI_FARVER[post.noegle as Pladskategori];
      expect(post.farve).toBe(forventet);
    }
  });

  it("har en tekst til hver farve", () => {
    for (const post of FARVEFORKLARING) {
      expect(post.tekst.length).toBeGreaterThan(0);
    }
  });
});
