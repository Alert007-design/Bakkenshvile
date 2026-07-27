import { describe, it, expect } from "vitest";
import {
  TABLES,
  TABLE_COUNT,
  VALID_TABLE_NUMBERS,
  isValidTableNumber,
  parseTableNumber,
  getTable,
  row,
  position,
  byRoute,
  type TableCategory,
} from "@/lib/tables";

// De 44 borde skrevet ud manuelt fra specifikationen — bevidst uafhængigt af
// implementeringen, så testen fanger enhver afvigelse i selve listen.
const SPEC_ROWS: Record<number, number[]> = {
  1: [11, 12, 13, 14, 15],
  2: [21, 22, 23, 24, 25],
  3: [31, 32, 33, 34, 35],
  4: [41, 42, 43, 44, 45],
  5: [51, 52, 53, 54, 55],
  6: [61, 62, 63, 64, 65],
  7: [71, 72, 73, 74],
  8: [81, 82, 83, 84],
  9: [91, 92, 93, 94],
  10: [101, 102],
};
const SPEC_NUMBERS = Object.values(SPEC_ROWS).flat();

describe("borddefinition — allowlist", () => {
  it("indeholder præcis 44 borde", () => {
    expect(TABLE_COUNT).toBe(44);
    expect(VALID_TABLE_NUMBERS).toHaveLength(44);
    expect(TABLES).toHaveLength(44);
  });

  it("accepterer alle 44 gyldige bordnumre", () => {
    for (const n of SPEC_NUMBERS) {
      expect(isValidTableNumber(n), `bord ${n} skal være gyldigt`).toBe(true);
      expect(parseTableNumber(String(n)), `bord ${n} skal kunne parses`).not.toBeNull();
    }
  });

  it("matcher specifikationens liste præcis", () => {
    expect([...VALID_TABLE_NUMBERS].sort((a, b) => a - b)).toEqual(
      [...SPEC_NUMBERS].sort((a, b) => a - b)
    );
  });

  it("har kun unikke numre", () => {
    expect(new Set(VALID_TABLE_NUMBERS).size).toBe(44);
  });

  it("afviser numre uden for allowlisten", () => {
    // Numre der ligner gyldige borde men ikke findes i salen.
    const invalid = [
      0, 10, 16, 20, 26, 36, 46, 56, 66, // rækker der kun har 5 pladser
      75, 76, 85, 86, 95, 96, // rækker 7-9 har kun 4 pladser
      100, 103, 104, 110, // række 10 har kun 101-102
      1, 5, 9, 99, 111, 1000, -63, 63.5, NaN,
    ];
    for (const n of invalid) {
      expect(isValidTableNumber(n), `bord ${n} skal afvises`).toBe(false);
    }
  });
});

describe("borddefinition — parsing af strenge", () => {
  it("afviser førende nul, whitespace og skrald", () => {
    for (const raw of ["063", "0", "", " 63", "63 ", "63a", "6 3", "+63", "-63", "6.3", "0x3f"]) {
      expect(parseTableNumber(raw), `"${raw}" skal afvises`).toBeNull();
    }
  });

  it("parser et gyldigt nummer til den rigtige definition", () => {
    const t = parseTableNumber("63");
    expect(t).not.toBeNull();
    expect(t!.number).toBe(63);
    expect(t!.row).toBe(6);
    expect(t!.position).toBe(3);
  });

  it("afviser ikke-streng/ikke-tal input", () => {
    for (const raw of [null, undefined, {}, [], true]) {
      expect(parseTableNumber(raw as unknown)).toBeNull();
    }
  });
});

describe("borddefinition — kategorier", () => {
  function cat(n: number): TableCategory {
    return getTable(n)!.category;
  }

  it("række 1-6 er A+", () => {
    for (const r of [1, 2, 3, 4, 5, 6]) {
      for (const n of SPEC_ROWS[r]) expect(cat(n), `bord ${n}`).toBe("A+");
    }
  });

  it("række 7-9 er A, undtagen bord 94", () => {
    for (const n of [...SPEC_ROWS[7], ...SPEC_ROWS[8], 91, 92, 93]) {
      expect(cat(n), `bord ${n}`).toBe("A");
    }
  });

  it("bord 94 er kategori B", () => {
    expect(cat(94)).toBe("B");
  });

  it("række 10 (101, 102) er B", () => {
    expect(cat(101)).toBe("B");
    expect(cat(102)).toBe("B");
  });
});

describe("borddefinition — række/placering og rute", () => {
  it("udleder række og placering korrekt", () => {
    expect(row(63)).toBe(6);
    expect(position(63)).toBe(3);
    expect(row(101)).toBe(10);
    expect(position(101)).toBe(1);
    expect(position(102)).toBe(2);
    expect(position(74)).toBe(4);
  });

  it("hver bords number/row/position er internt konsistente", () => {
    for (const t of TABLES) {
      expect(row(t.number)).toBe(t.row);
      expect(position(t.number)).toBe(t.position);
    }
  });

  it("sorterer efter rute: række først, så placering nærmest baren", () => {
    const shuffled = [102, 11, 94, 63, 71, 15, 91];
    const sorted = [...shuffled].sort(byRoute);
    expect(sorted).toEqual([11, 15, 63, 71, 91, 94, 102]);
  });
});
