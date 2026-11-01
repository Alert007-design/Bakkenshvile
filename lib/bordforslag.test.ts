import { describe, it, expect } from "vitest";
import { delIBorde, lavBordforslag, bordTekstPrBooking, MAKS_PR_BORD, type ForslagBooking } from "./bordforslag";
import { getTable } from "./tables";

function b(id: string, n: number, extra: Partial<ForslagBooking> = {}): ForslagBooking {
  return { id, ticketCount: n, wantsMatching: false, ageGroup: "", location: "", interests: "", drinkPreference: "", ...extra };
}
const FORREST = "A+ (1.-2.-3. række)";

describe("delIBorde", () => {
  it("fylder et bord med 5 og sætter resten ved nabobordet", () => {
    expect(delIBorde(5)).toEqual([5]);
    expect(delIBorde(6)).toEqual([5, 1]);
    expect(delIBorde(7)).toEqual([5, 2]);
    expect(delIBorde(8)).toEqual([5, 3]);
    expect(delIBorde(10)).toEqual([5, 5]);
    expect(delIBorde(11)).toEqual([5, 5, 1]);
    expect(delIBorde(12)).toEqual([5, 5, 2]);
  });
  it("giver tom liste ved 0", () => {
    expect(delIBorde(0)).toEqual([]);
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

  it("deler et selskab på 7 som 5+2 ved borde ved siden af hinanden i samme række", () => {
    const f = lavBordforslag([[FORREST, [b("syv", 7)]]]);
    expect(f.map((x) => x.pladser[0].antal)).toEqual([5, 2]);
    const [t1, t2] = f.map((x) => getTable(x.table!)!);
    expect(t1.row).toBe(t2.row);
    expect(Math.abs(t1.position - t2.position)).toBe(1);
  });

  it("deler et selskab på 6 som 5+1 ved borde ved siden af hinanden i samme række", () => {
    const f = lavBordforslag([[FORREST, [b("seks", 6)]]]);
    expect(f.map((x) => x.pladser[0].antal)).toEqual([5, 1]);
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

  it("sætter et selskab på 2-3 ved bordet med den ene fra et selskab på 6", () => {
    const f = lavBordforslag([[FORREST, [b("seks", 6), b("par", 2), b("fire", 4)]]]);
    const enerBord = f.find((x) => x.pladser.some((p) => p.row.id === "seks" && p.antal === 1))!;
    expect(enerBord.pladser.map((p) => p.row.id).sort()).toEqual(["par", "seks"]);
  });

  it("bruger et selskab på 3 ved enerbordet, når der ikke er et par", () => {
    const f = lavBordforslag([[FORREST, [b("seks", 6), b("tre", 3)]]]);
    const enerBord = f.find((x) => x.pladser.some((p) => p.row.id === "seks" && p.antal === 1))!;
    expect(enerBord.pladser.map((p) => p.row.id).sort()).toEqual(["seks", "tre"]);
  });

  it("sætter enlige sammen ved et bord med et par", () => {
    const f = lavBordforslag([[FORREST, [b("e1", 1), b("e2", 1), b("par", 2), b("tre", 3)]]]);
    const tekst = bordTekstPrBooking(f);
    expect(tekst.get("e1")).toBe(tekst.get("par"));
    expect(tekst.get("e2")).toBe(tekst.get("par"));
    expect(tekst.get("tre")).not.toBe(tekst.get("par"));
  });

  it("sætter enlige ved et bord med et selskab på 3, når der ikke er et par", () => {
    const f = lavBordforslag([[FORREST, [b("e1", 1), b("e2", 1), b("tre", 3), b("fire", 4)]]]);
    const tekst = bordTekstPrBooking(f);
    expect(tekst.get("e1")).toBe(tekst.get("tre"));
    expect(tekst.get("e2")).toBe(tekst.get("tre"));
  });

  it("deler mange enlige ud på flere par og fylder aldrig over 5", () => {
    const enlige = Array.from({ length: 5 }, (_, i) => b(`e${i}`, 1));
    const f = lavBordforslag([[FORREST, [...enlige, b("p1", 2), b("p2", 2)]]]);
    for (const bord of f) {
      expect(bord.pladser.reduce((s, p) => s + p.antal, 0)).toBeLessThanOrEqual(MAKS_PR_BORD);
    }
    const tekst = bordTekstPrBooking(f);
    const vedPar = enlige.filter((e) => [tekst.get("p1"), tekst.get("p2")].includes(tekst.get(e.id)));
    expect(vedPar.length).toBe(5);
  });

  it("sætter enlige sammen, når der hverken er par eller selskaber på 3", () => {
    const f = lavBordforslag([[FORREST, [b("e1", 1), b("e2", 1), b("fire", 4)]]]);
    const tekst = bordTekstPrBooking(f);
    expect(tekst.get("e1")).toBe(tekst.get("e2"));
  });
});
