import { describe, it, expect } from "vitest";
import { pladserTekst } from "@/lib/ticket-email";

describe("pladserTekst", () => {
  it("sætter antal før kategori", () => {
    expect(pladserTekst("A (7.-8.-9. række) x1")).toBe("1 x A (7.-8.-9. række)");
  });

  it("klarer flere kategorier og ×-tegnet", () => {
    expect(pladserTekst("A+ x2, B × 1")).toBe("2 x A+, 1 x B");
  });

  it("viser teksten uændret, hvis den ikke kan læses", () => {
    expect(pladserTekst("Fribillet")).toBe("Fribillet");
    expect(pladserTekst("")).toBe("");
  });
});
