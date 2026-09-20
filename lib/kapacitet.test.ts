// Tests for kapacitetsberegningen — den rene del uden database.
//
// Reglerne, der bevogtes her:
//  - standardkapaciteten er 58 / 60 / 42 / 12, i alt 172
//  - et udfyldt felt på forestillingen i Airtable går forud for standardtallet
//  - justeres kapaciteten ned under det allerede solgte, bliver "tilbage" 0 —
//    aldrig et negativt tal
//  - det manuelle udsolgt-flueben har altid forrang
//  - en billettype uden kapacitetskategori kan ikke sælges (fejler lukket)

import { describe, it, expect } from "vitest";
import {
  KAPACITETSKATEGORIER,
  KATEGORI_NAVN,
  STANDARD_KAPACITET,
  byggOversigt,
  kapaciteterFor,
  kategoriFraAirtable,
  tilbageEfterSalg,
} from "@/lib/kapacitet";

const INGEN_TAGNE = { aplusForrest: 0, aplusBagerst: 0, a: 0, b: 0 };

describe("standardkapaciteten", () => {
  it("er ejerens fire tal og ikke udledt af bordplanen", () => {
    expect(STANDARD_KAPACITET).toEqual({
      aplusForrest: 58,
      aplusBagerst: 60,
      a: 42,
      b: 12,
    });
  });

  it("giver 172 billetter i alt", () => {
    const sum = KAPACITETSKATEGORIER.reduce(
      (s, k) => s + STANDARD_KAPACITET[k],
      0
    );
    expect(sum).toBe(172);
  });

  it("dækker præcis fire priskategorier", () => {
    expect(KAPACITETSKATEGORIER).toEqual([
      "aplusForrest",
      "aplusBagerst",
      "a",
      "b",
    ]);
  });

  it("har et læsbart dansk navn til hver kategori", () => {
    for (const k of KAPACITETSKATEGORIER) {
      expect(KATEGORI_NAVN[k].length).toBeGreaterThan(0);
    }
  });
});

describe("kategoriFraAirtable", () => {
  it("genkender de fire valgmuligheder", () => {
    expect(kategoriFraAirtable("A+ forrest")).toBe("aplusForrest");
    expect(kategoriFraAirtable("A+ bagerst")).toBe("aplusBagerst");
    expect(kategoriFraAirtable("A")).toBe("a");
    expect(kategoriFraAirtable("B")).toBe("b");
  });

  it("tåler at Airtable leverer et single-select som objekt", () => {
    expect(kategoriFraAirtable({ id: "sel1", name: "A+ bagerst" })).toBe(
      "aplusBagerst"
    );
  });

  it("tåler mellemrum omkring værdien", () => {
    expect(kategoriFraAirtable("  A+ forrest ")).toBe("aplusForrest");
  });

  it("returnerer null for tomt, ukendt eller forkert felt — fejler lukket", () => {
    expect(kategoriFraAirtable("")).toBeNull();
    expect(kategoriFraAirtable(null)).toBeNull();
    expect(kategoriFraAirtable(undefined)).toBeNull();
    expect(kategoriFraAirtable("A++")).toBeNull();
    expect(kategoriFraAirtable("a")).toBeNull();
    expect(kategoriFraAirtable(42)).toBeNull();
  });
});

describe("kapaciteterFor", () => {
  it("bruger standardtallene, når forestillingen ikke er justeret", () => {
    expect(kapaciteterFor({})).toEqual(STANDARD_KAPACITET);
  });

  it("lader en justering op slå igennem", () => {
    expect(kapaciteterFor({ b: 20 }).b).toBe(20);
  });

  it("lader en justering ned slå igennem", () => {
    expect(kapaciteterFor({ a: 10 }).a).toBe(10);
  });

  it("justerer kun den kategori, tallet står på", () => {
    const k = kapaciteterFor({ aplusForrest: 30 });
    expect(k.aplusForrest).toBe(30);
    expect(k.aplusBagerst).toBe(60);
    expect(k.a).toBe(42);
    expect(k.b).toBe(12);
  });

  it("behandler 0 som en rigtig justering, ikke som tomt", () => {
    expect(kapaciteterFor({ b: 0 }).b).toBe(0);
  });

  it("ignorerer tomme, negative og ikke-hele tal og falder tilbage på standard", () => {
    expect(kapaciteterFor({ b: null }).b).toBe(12);
    expect(kapaciteterFor({ b: undefined }).b).toBe(12);
    expect(kapaciteterFor({ b: -5 }).b).toBe(12);
    expect(kapaciteterFor({ b: 7.5 }).b).toBe(12);
    expect(kapaciteterFor({ b: NaN }).b).toBe(12);
  });
});

describe("tilbageEfterSalg", () => {
  it("trækker det tagne fra kapaciteten", () => {
    expect(tilbageEfterSalg(58, 12)).toBe(46);
  });

  it("giver 0 og aldrig et negativt tal, når kapaciteten sænkes under det solgte", () => {
    expect(tilbageEfterSalg(10, 25)).toBe(0);
  });

  it("giver 0 ved præcis udsolgt", () => {
    expect(tilbageEfterSalg(10, 10)).toBe(0);
  });
});

describe("byggOversigt", () => {
  it("regner tilbage ud for alle fire kategorier", () => {
    const o = byggOversigt({
      kapaciteter: STANDARD_KAPACITET,
      tagne: { aplusForrest: 8, aplusBagerst: 60, a: 0, b: 11 },
      manueltUdsolgt: false,
    });
    expect(o.aplusForrest).toEqual({ kapacitet: 58, taget: 8, tilbage: 50 });
    expect(o.aplusBagerst).toEqual({ kapacitet: 60, taget: 60, tilbage: 0 });
    expect(o.a).toEqual({ kapacitet: 42, taget: 0, tilbage: 42 });
    expect(o.b).toEqual({ kapacitet: 12, taget: 11, tilbage: 1 });
  });

  it("viser 0 tilbage i alle kategorier, når kapaciteten er sænket under det solgte", () => {
    const o = byggOversigt({
      kapaciteter: { ...STANDARD_KAPACITET, b: 4 },
      tagne: { ...INGEN_TAGNE, b: 9 },
      manueltUdsolgt: false,
    });
    expect(o.b.tilbage).toBe(0);
    expect(o.b.taget).toBe(9);
    expect(o.b.kapacitet).toBe(4);
  });

  it("det manuelle udsolgt-flueben har forrang over alle tal", () => {
    const o = byggOversigt({
      kapaciteter: STANDARD_KAPACITET,
      tagne: INGEN_TAGNE,
      manueltUdsolgt: true,
    });
    for (const k of KAPACITETSKATEGORIER) {
      expect(o[k].tilbage).toBe(0);
    }
  });

  it("rører ikke kapacitets- og salgstallene, selv om showet er markeret udsolgt", () => {
    const o = byggOversigt({
      kapaciteter: STANDARD_KAPACITET,
      tagne: { ...INGEN_TAGNE, a: 5 },
      manueltUdsolgt: true,
    });
    expect(o.a.kapacitet).toBe(42);
    expect(o.a.taget).toBe(5);
  });
});
