import { describe, it, expect } from "vitest";
import { delLigeligt, lavBordforslag, bordTekstPrBooking, MAKS_PR_BORD, type ForslagBooking } from "./bordforslag";
import { getTable } from "./tables";

function b(id: string, n: number, extra: Partial<ForslagBooking> = {}): ForslagBooking {
  return { id, ticketCount: n, wantsMatching: false, ageGroup: "", location: "", interests: "", drinkPreference: "", ...extra };
}
const FORREST = "A+ (1.-2.-3. række)";

describe("delLigeligt", () => {
  it("deler ligeligt og aldrig 5+1", () => {
    expect(delLigeligt(5)).toEqual([5]);
    expect(delLigeligt(6)).toEqual([3, 3]);
    expect(delLigeligt(7)).toEqual([4, 3]);
    expect(delLigeligt(8)).toEqual([4, 4]);
    expect(delLigeligt(11)).toEqual([4, 4, 3]);
    expect(delLigeligt(20)).toEqual([5, 5, 5, 5]);
    expect(delLigeligt(12)).toEqual([4, 4, 4]);
  });
  it("giver tom liste ved 0", () => {
    expect(delLigeligt(0)).toEqual([]);
  });
});

describe("lavBordforslag", () => {
  it("sætter aldrig mere end 5 ved et bord", () => {
    const f = lavBordforslag([[FORREST, [b("a", 4), b("b", 3), b("c", 2), b("d", 1), b("e", 6)]]]);
    for (const bord of f) {
      expect(bord.pladser.reduce((s, p) => s + p.antal, 0)).toBeLessThanOrEqual(MAKS_PR_BORD);
    }
    const total = f.flatMap((x) => x.pladser).reduce((s, p) => s + p.antal, 0);
    expect(total).toBe(16);
  });

  it("deler et selskab på 6 som 3+3 ved borde ved siden af hinanden i samme række", () => {
    const f = lavBordforslag([[FORREST, [b("seks", 6)]]]);
    expect(f.map((x) => x.pladser[0].antal)).toEqual([3, 3]);
    const [t1, t2] = f.map((x) => getTable(x.table!)!);
    expect(t1.row).toBe(t2.row);
    expect(Math.abs(t1.position - t2.position)).toBe(1);
    expect(bordTekstPrBooking(f).get("seks")).toBe(`${t1.number}+${t2.number}`);
  });

  it("bruger salens rigtige bordnumre i kategoriens rækker", () => {
    const f = lavBordforslag([
      [FORREST, [b("x", 2)]],
      ["A+ (4.-5.-6. række)", [b("y", 2)]],
      ["A (7.-8.-9. række)", [b("z", 2)]],
      ["B (10. række)", [b("w", 2)]],
    ]);
    const rows = f.map((x) => getTable(x.table!)!);
    expect(rows[0].row).toBeLessThanOrEqual(3);
    expect(rows[1].row).toBeGreaterThanOrEqual(4);
    expect(rows[1].row).toBeLessThanOrEqual(6);
    expect(rows[2].category).toBe("A");
    expect(rows[3].category).toBe("B");
  });

  it("sætter selskaber, der matcher, ved samme bord", () => {
    const f = lavBordforslag([[FORREST, [
      b("a", 2, { wantsMatching: true, ageGroup: "60+" }),
      b("b", 2, { wantsMatching: true, ageGroup: "30-45" }),
      b("c", 2, { wantsMatching: true, ageGroup: "60+" }),
    ]]]);
    const tekst = bordTekstPrBooking(f);
    expect(tekst.get("a")).toBe(tekst.get("c"));
  });

  it("laver ekstra borde i stedet for at fejle, når salen er fuld", () => {
    const mange = Array.from({ length: 50 }, (_, i) => b(`g${i}`, 4));
    const f = lavBordforslag([[FORREST, mange]]);
    expect(f.length).toBe(50);
    expect(f.filter((x) => x.table === null).length).toBe(6);
    expect(new Set(f.filter((x) => x.table !== null).map((x) => x.table)).size).toBe(44);
  });
});
