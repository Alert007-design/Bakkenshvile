import { describe, it, expect } from "vitest";
import { laesKundeAdresse } from "@/lib/kunde-adresse";

describe("laesKundeAdresse", () => {
  it("kræver postnummer", () => {
    expect(laesKundeAdresse({})).toEqual({ ok: false, fejl: "Postnummer er påkrævet." });
    expect(laesKundeAdresse({ zip: "   " }).ok).toBe(false);
  });

  it("godtager danske og udenlandske postnumre", () => {
    for (const zip of ["2930", "123 45", "10115", "SE-123 45"]) {
      expect(laesKundeAdresse({ zip }).ok).toBe(true);
    }
  });

  it("afviser noget, der ikke ligner et postnummer", () => {
    expect(laesKundeAdresse({ zip: "abc" }).ok).toBe(false);
    expect(laesKundeAdresse({ zip: "<script>" }).ok).toBe(false);
    expect(laesKundeAdresse({ zip: "12345678901" }).ok).toBe(false);
  });

  it("vej og by er frivillige og renses", () => {
    const svar = laesKundeAdresse({ zip: " 2930 ", address: "  Dyrehavsbakken   38 ", city: "Klampenborg" });
    expect(svar).toEqual({
      ok: true,
      adresse: { adresse: "Dyrehavsbakken 38", postnummer: "2930", by: "Klampenborg" },
    });
  });

  it("afkorter for lange felter", () => {
    const svar = laesKundeAdresse({ zip: "2930", address: "x".repeat(300) });
    expect(svar.ok && svar.adresse.adresse.length).toBe(100);
  });
});
