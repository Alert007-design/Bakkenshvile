import { describe, it, expect } from "vitest";
import { byggPrisoversigt, type Billettype } from "./prisoversigt";

const typer: Billettype[] = [
  { priceGroup: "Hverdag", kapacitetskategori: "aplusForrest", price: 409, fee: 30 },
  { priceGroup: "Hverdag", kapacitetskategori: "aplusBagerst", price: 379, fee: 30 },
  { priceGroup: "Hverdag", kapacitetskategori: "a", price: 349, fee: 30 },
  { priceGroup: "Hverdag", kapacitetskategori: "b", price: 279, fee: 30 },
  { priceGroup: "Ordinær", kapacitetskategori: "aplusForrest", price: 429, fee: 30 },
  { priceGroup: "Ordinær", kapacitetskategori: "aplusBagerst", price: 399, fee: 30 },
  { priceGroup: "Ordinær", kapacitetskategori: "a", price: 369, fee: 30 },
  { priceGroup: "Ordinær", kapacitetskategori: "b", price: 289, fee: 30 },
  // Forpremierer må ikke komme med i tabellen.
  { priceGroup: "Forpremiere 10. maj", kapacitetskategori: "aplusForrest", price: 319, fee: 30 },
];

describe("byggPrisoversigt", () => {
  it("viser pris inkl. gebyr for hverdag og weekend i salens rækkefølge", () => {
    const r = byggPrisoversigt(typer);
    expect(r.map((x) => [x.kategori, x.hverdag, x.weekend])).toEqual([
      ["aplusForrest", 439, 459],
      ["aplusBagerst", 409, 429],
      ["a", 379, 399],
      ["b", 309, 319],
    ]);
  });

  it("gætter ikke på en pris, der mangler", () => {
    const r = byggPrisoversigt(typer.filter((t) => !(t.priceGroup === "Hverdag" && t.kapacitetskategori === "b")));
    expect(r[3].hverdag).toBeNull();
    expect(r[3].weekend).toBe(319);
  });

  it("ignorerer billettyper uden kapacitetskategori", () => {
    const r = byggPrisoversigt([{ priceGroup: "Hverdag", kapacitetskategori: null, price: 1, fee: 0 }]);
    expect(r.every((x) => x.hverdag === null && x.weekend === null)).toBe(true);
  });
});
