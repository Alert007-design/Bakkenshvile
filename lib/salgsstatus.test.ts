import { describe, it, expect } from "vitest";
import { fordelSalg, byggStatuslinje, type HoldLinje } from "./salgsstatus";
import { STANDARD_KAPACITET } from "./kapacitet";

const NUL = { aplusForrest: 0, aplusBagerst: 0, a: 0, b: 0 };

function hold(extra: Partial<HoldLinje>): HoldLinje {
  return { showId: "s1", bookingId: "b1", kategori: "a", antal: 2, status: "sold", ...extra };
}

describe("fordelSalg", () => {
  it("tæller betalte pladser som solgt", () => {
    const m = fordelSalg([hold({ antal: 4 })], new Set());
    expect(m.get("s1")!.solgt.a).toBe(4);
    expect(m.get("s1")!.reserveret.a).toBe(0);
  });

  it("tæller pladser under betaling eller i store selskaber som reserveret", () => {
    const m = fordelSalg([hold({ status: "held", antal: 3, kategori: "b" })], new Set());
    expect(m.get("s1")!.reserveret.b).toBe(3);
    expect(m.get("s1")!.solgt.b).toBe(0);
  });

  it("tæller gamle bookinger, der mangler betaling, som reserveret", () => {
    const m = fordelSalg(
      [hold({ bookingId: "ubetalt", antal: 30, kategori: "aplusForrest" }), hold({ bookingId: "betalt", antal: 5, kategori: "aplusForrest" })],
      new Set(["ubetalt"])
    );
    expect(m.get("s1")!.reserveret.aplusForrest).toBe(30);
    expect(m.get("s1")!.solgt.aplusForrest).toBe(5);
  });

  it("holder forestillingerne adskilt og lægger sammen pr. kategori", () => {
    const m = fordelSalg(
      [hold({ antal: 2 }), hold({ bookingId: "b2", antal: 3 }), hold({ showId: "s2", antal: 7 })],
      new Set()
    );
    expect(m.get("s1")!.solgt.a).toBe(5);
    expect(m.get("s2")!.solgt.a).toBe(7);
  });

  it("springer ukendte kategorier og ugyldige antal over", () => {
    const m = fordelSalg(
      [hold({ kategori: "x" as never }), hold({ antal: 0 }), hold({ antal: -2 })],
      new Set()
    );
    expect(m.get("s1")?.solgt ?? NUL).toEqual(NUL);
  });
});

describe("byggStatuslinje", () => {
  const kapaciteter = { ...STANDARD_KAPACITET };

  it("beregner solgt, reserveret og til salg pr. kategori og i alt", () => {
    const l = byggStatuslinje({
      kapaciteter,
      tagne: { aplusForrest: 10, aplusBagerst: 0, a: 4, b: 0 },
      solgt: { aplusForrest: 8, aplusBagerst: 0, a: 4, b: 0 },
      reserveret: { aplusForrest: 2, aplusBagerst: 0, a: 0, b: 0 },
      manueltUdsolgt: false,
    });
    expect(l.kategorier.aplusForrest).toEqual({
      kapacitet: kapaciteter.aplusForrest,
      solgt: 8,
      reserveret: 2,
      tilSalg: kapaciteter.aplusForrest - 10,
    });
    const kap = Object.values(kapaciteter).reduce((s, n) => s + n, 0);
    expect(l.iAlt).toEqual({ kapacitet: kap, solgt: 12, reserveret: 2, tilSalg: kap - 14 });
  });

  it("viser nul til salg overalt, når forestillingen er sat til udsolgt", () => {
    const l = byggStatuslinje({ kapaciteter, tagne: NUL, solgt: NUL, reserveret: NUL, manueltUdsolgt: true });
    expect(l.iAlt.tilSalg).toBe(0);
    expect(l.kategorier.b.tilSalg).toBe(0);
  });

  it("går aldrig under nul til salg, hvis der er solgt mere end kapaciteten", () => {
    const l = byggStatuslinje({
      kapaciteter: { ...kapaciteter, b: 5 },
      tagne: { ...NUL, b: 8 },
      solgt: { ...NUL, b: 8 },
      reserveret: NUL,
      manueltUdsolgt: false,
    });
    expect(l.kategorier.b.tilSalg).toBe(0);
  });
});
