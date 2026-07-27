import { describe, it, expect } from "vitest";
import {
  kronerToOre,
  vatFromGrossOre,
  lineTotalOre,
  computeOrderTotals,
  formatOre,
} from "@/lib/money";

describe("kronerToOre", () => {
  it("omregner kroner til hele øre", () => {
    expect(kronerToOre(95)).toBe(9500);
    expect(kronerToOre(89.5)).toBe(8950);
    expect(kronerToOre(0)).toBe(0);
    expect(kronerToOre(129.99)).toBe(12999);
  });

  it("kaster på ugyldige tal", () => {
    expect(() => kronerToOre(NaN)).toThrow();
    expect(() => kronerToOre(Infinity)).toThrow();
  });
});

describe("moms inkluderet i pris", () => {
  it("beregner momsandelen af en bruttopris", () => {
    // 125 kr inkl. 25% moms → moms = 25 kr = 2500 øre
    expect(vatFromGrossOre(12500, 25)).toBe(2500);
    // 100 øre inkl. 25% → 20 øre
    expect(vatFromGrossOre(100, 25)).toBe(20);
  });

  it("håndterer 0% moms", () => {
    expect(vatFromGrossOre(10000, 0)).toBe(0);
  });

  it("kaster på ugyldig momssats", () => {
    expect(() => vatFromGrossOre(100, -5)).toThrow();
  });
});

describe("lineTotalOre", () => {
  it("ganger enhedspris med antal", () => {
    expect(lineTotalOre(9500, 3)).toBe(28500);
    expect(lineTotalOre(9500, 0)).toBe(0);
  });

  it("kræver heltal og ikke-negativt antal", () => {
    expect(() => lineTotalOre(95.5, 2)).toThrow();
    expect(() => lineTotalOre(9500, -1)).toThrow();
  });
});

describe("computeOrderTotals", () => {
  it("summerer total, moms og subtotal i øre", () => {
    const totals = computeOrderTotals([
      { unitPriceOre: 9500, quantity: 2, vatRate: 25 }, // 19000
      { unitPriceOre: 4500, quantity: 1, vatRate: 25 }, // 4500
    ]);
    expect(totals.totalOre).toBe(23500);
    // moms: 19000*25/125=3800 + 4500*25/125=900 = 4700
    expect(totals.vatOre).toBe(4700);
    expect(totals.subtotalOre).toBe(23500 - 4700);
  });

  it("tom ordre er nul", () => {
    expect(computeOrderTotals([])).toEqual({
      subtotalOre: 0,
      vatOre: 0,
      totalOre: 0,
    });
  });

  it("blander momssatser korrekt (moms pr. linje)", () => {
    const totals = computeOrderTotals([
      { unitPriceOre: 10000, quantity: 1, vatRate: 25 }, // moms 2000
      { unitPriceOre: 10000, quantity: 1, vatRate: 0 }, // moms 0
    ]);
    expect(totals.totalOre).toBe(20000);
    expect(totals.vatOre).toBe(2000);
  });
});

describe("formatOre", () => {
  it("formaterer med komma og kr", () => {
    expect(formatOre(12950)).toBe("129,50 kr.");
    expect(formatOre(0)).toBe("0,00 kr.");
  });
});
