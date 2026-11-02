import { describe, it, expect } from "vitest";
import {
  dagIKoebenhavn,
  tildelGaestenumre,
  delPaaKategorier,
  sorterEfterBestilt,
  kundeBemaerkning,
  faarNummer,
  manglerBetaling,
  kategoriTekst,
  type NummerBooking,
} from "./gaesteliste";

function nb(
  id: string,
  bestilt: string,
  extra: Partial<NummerBooking> = {}
): NummerBooking {
  return { id, email: `${id}@eksempel.dk`, bestilt, gaestenummer: null, status: "Betalt", ...extra };
}

describe("dagIKoebenhavn", () => {
  it("bruger dansk tid, ikke UTC", () => {
    // 23:30 UTC den 1. august er 01:30 den 2. august i København (sommertid).
    expect(dagIKoebenhavn("2026-08-01T23:30:00.000Z")).toBe("2026-08-02");
    expect(dagIKoebenhavn("2026-08-01T10:00:00.000Z")).toBe("2026-08-01");
  });
});

describe("faarNummer", () => {
  it("giver kun nummer til betalte og ekstrabilletter, der venter på betaling", () => {
    expect(faarNummer("Betalt")).toBe(true);
    expect(faarNummer("Ekstra – afventer betaling")).toBe(true);
    expect(faarNummer("Afventer betaling")).toBe(false);
    expect(faarNummer("Annulleret")).toBe(false);
    expect(faarNummer("Udløbet")).toBe(false);
    expect(faarNummer("")).toBe(false);
  });
});

describe("tildelGaestenumre", () => {
  it("nummererer efter bestillingstidspunkt", () => {
    const nye = tildelGaestenumre([
      nb("c", "2026-08-03T10:00:00Z"),
      nb("a", "2026-08-01T10:00:00Z"),
      nb("b", "2026-08-02T10:00:00Z"),
    ]);
    expect(Object.fromEntries(nye)).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("giver samme nummer til samme mail samme dag, uanset store bogstaver", () => {
    const nye = tildelGaestenumre([
      nb("a", "2026-08-01T08:00:00Z", { email: "Hans@Eksempel.dk" }),
      nb("x", "2026-08-01T09:00:00Z"),
      nb("b", "2026-08-01T15:00:00Z", { email: " hans@eksempel.dk " }),
    ]);
    expect(nye.get("a")).toBe(1);
    expect(nye.get("x")).toBe(2);
    expect(nye.get("b")).toBe(1);
  });

  it("giver nyt nummer til samme mail på en anden dag", () => {
    const nye = tildelGaestenumre([
      nb("a", "2026-08-01T08:00:00Z", { email: "hans@eksempel.dk" }),
      nb("b", "2026-08-02T08:00:00Z", { email: "hans@eksempel.dk" }),
    ]);
    expect(nye.get("a")).toBe(1);
    expect(nye.get("b")).toBe(2);
  });

  it("rører aldrig et nummer, der allerede er givet, og fortsætter efter det højeste", () => {
    const nye = tildelGaestenumre([
      nb("a", "2026-08-01T08:00:00Z", { gaestenummer: 1 }),
      // Nummer 2 er slettet; der skal ikke fyldes op.
      nb("c", "2026-08-03T08:00:00Z", { gaestenummer: 3 }),
      nb("d", "2026-08-04T08:00:00Z"),
    ]);
    expect(nye.has("a")).toBe(false);
    expect(nye.has("c")).toBe(false);
    expect(nye.get("d")).toBe(4);
  });

  it("genbruger et eksisterende nummer for samme mail samme dag", () => {
    const nye = tildelGaestenumre([
      nb("a", "2026-08-01T08:00:00Z", { email: "x@y.dk", gaestenummer: 7 }),
      nb("b", "2026-08-01T20:00:00Z", { email: "x@y.dk" }),
    ]);
    expect(nye.get("b")).toBe(7);
  });

  it("giver ikke nummer til forladte kurve, annullerede og udløbne", () => {
    const nye = tildelGaestenumre([
      nb("a", "2026-08-01T08:00:00Z", { status: "Afventer betaling" }),
      nb("b", "2026-08-02T08:00:00Z", { status: "Annulleret" }),
      nb("c", "2026-08-03T08:00:00Z", { status: "Udløbet" }),
      nb("d", "2026-08-04T08:00:00Z"),
    ]);
    expect(Object.fromEntries(nye)).toEqual({ d: 1 });
  });

  it("slår ikke bookinger uden mail sammen", () => {
    const nye = tildelGaestenumre([
      nb("a", "2026-08-01T08:00:00Z", { email: "" }),
      nb("b", "2026-08-01T09:00:00Z", { email: "" }),
    ]);
    expect(nye.get("a")).toBe(1);
    expect(nye.get("b")).toBe(2);
  });

  it("giver samme resultat, uanset rækkefølgen bookingerne kommer i", () => {
    const liste = [
      nb("a", "2026-08-01T08:00:00Z"),
      nb("b", "2026-08-01T08:00:00Z"),
      nb("c", "2026-07-01T08:00:00Z"),
    ];
    const en = Object.fromEntries(tildelGaestenumre(liste));
    const to = Object.fromEntries(tildelGaestenumre([...liste].reverse()));
    expect(en).toEqual(to);
    expect(en.c).toBe(1);
  });
});

describe("delPaaKategorier", () => {
  it("deler en booking med flere kategorier op", () => {
    expect(delPaaKategorier("A+ (1.-2.-3. række) x2, B (10. række) x1", 3)).toEqual([
      { kategori: "A+ (1.-2.-3. række)", antal: 2 },
      { kategori: "B (10. række)", antal: 1 },
    ]);
  });

  it("lægger samme kategori sammen, hvis den står to gange", () => {
    expect(delPaaKategorier("A x1, A x2", 3)).toEqual([{ kategori: "A", antal: 3 }]);
  });

  it("falder tilbage til én ukendt kategori, når teksten mangler", () => {
    expect(delPaaKategorier("", 4)).toEqual([{ kategori: "Ukendt kategori", antal: 4 }]);
  });

  it("falder tilbage til én ukendt kategori, når teksten ikke kan læses", () => {
    expect(delPaaKategorier("noget rod", 2)).toEqual([{ kategori: "Ukendt kategori", antal: 2 }]);
  });
});

describe("sorterEfterBestilt", () => {
  it("sætter den først bestilte øverst og bruger id ved uafgjort", () => {
    const ud = sorterEfterBestilt([
      { id: "b", bestilt: "2026-08-02T00:00:00Z" },
      { id: "c", bestilt: "2026-08-01T00:00:00Z" },
      { id: "a", bestilt: "2026-08-02T00:00:00Z" },
    ]);
    expect(ud.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});

describe("kundeBemaerkning", () => {
  it("fjerner systemtekster fra det gamle system", () => {
    expect(kundeBemaerkning("Fra TicketCloud, gl. bord 12")).toBe("");
    expect(kundeBemaerkning("Fra TicketCloud")).toBe("");
    expect(kundeBemaerkning("Overført fra TicketCloud (gl. bordnr. 31)")).toBe("");
  });

  it("beholder kundens egen tekst og fjerner systemdelen", () => {
    expect(kundeBemaerkning("2 ældre kvinder, 1 med rolator | Fra TicketCloud")).toBe(
      "2 ældre kvinder, 1 med rolator"
    );
    expect(kundeBemaerkning("Gerne 1. række | Fra TicketCloud, gl. bord 01")).toBe("Gerne 1. række");
  });

  it("flytter oplysning om manglende betaling ud af bemærkningen (den har sit eget mærke)", () => {
    expect(
      kundeBemaerkning("Ikke betalt i det gamle system (Telefonbestilling): mangler 900 kr. | Fra TicketCloud")
    ).toBe("");
  });

  it("fjerner forestillingsteksten fra nye køb", () => {
    expect(kundeBemaerkning("Show: lør 5. juni kl. 20:00")).toBe("");
    expect(kundeBemaerkning("Show: lør 5. juni kl. 20:00 — Kørestol, tak")).toBe("Kørestol, tak");
  });

  it("viser kun noten ved fribilletter og ekstrabilletter", () => {
    expect(kundeBemaerkning("Fribillet")).toBe("");
    expect(kundeBemaerkning("Fribillet — Sangerindens mor")).toBe("Sangerindens mor");
    expect(kundeBemaerkning("Ekstrabillet")).toBe("");
    expect(kundeBemaerkning("Ekstrabillet – Ringet ind")).toBe("Ringet ind");
  });

  it("tåler tom og manglende tekst", () => {
    expect(kundeBemaerkning("")).toBe("");
    expect(kundeBemaerkning(undefined)).toBe("");
  });
});

describe("manglerBetaling", () => {
  const note = "Ikke betalt i det gamle system (Telefonbestilling): mangler 24622 kr. | Fra TicketCloud, gl. bord 08";

  it("finder beløbet, der mangler fra det gamle system", () => {
    expect(manglerBetaling(note, 0)).toBe(24622);
    expect(manglerBetaling(note, null)).toBe(24622);
  });

  it("trækker det, der siden er betalt, fra", () => {
    expect(manglerBetaling(note, 10000)).toBe(14622);
  });

  it("forsvinder, når hele beløbet er betalt", () => {
    expect(manglerBetaling(note, 24622)).toBeNull();
    expect(manglerBetaling(note, 30000)).toBeNull();
  });

  it("virker, når noten står midt i teksten", () => {
    const midt = "skal sidde 4-5 række .betaler senest 4. maj 2027 | Ikke betalt i det gamle system (Telefonbestilling): mangler 9816 kr. | Fra TicketCloud, gl. bord 03";
    expect(manglerBetaling(midt, 0)).toBe(9816);
  });

  it("forstår beløb med tusindtalspunktum og øre", () => {
    expect(manglerBetaling("Ikke betalt i det gamle system: mangler 1.377,50 kr.", 0)).toBe(1377.5);
  });

  it("giver null uden noten", () => {
    expect(manglerBetaling("Kørestol | Fra TicketCloud, gl. bord 12", 0)).toBeNull();
    expect(manglerBetaling("", 0)).toBeNull();
    expect(manglerBetaling(undefined, 0)).toBeNull();
  });
});

describe("kundeBemaerkning og noten om manglende betaling", () => {
  it("viser ikke systemets note om manglende betaling som kundens bemærkning", () => {
    expect(
      kundeBemaerkning("Ikke betalt i det gamle system (Telefonbestilling): mangler 24622 kr. | Fra TicketCloud, gl. bord 08")
    ).toBe("");
  });

  it("beholder kundens egen tekst ved siden af noten", () => {
    expect(
      kundeBemaerkning("betaler ved indgang | Ikke betalt i det gamle system (Telefonbestilling): mangler 1377 kr. | Fra TicketCloud")
    ).toBe("betaler ved indgang");
  });
});

describe("kategoriTekst", () => {
  it("viser kategorien uden antal, når der kun er én", () => {
    expect(kategoriTekst("A+ (1.-2.-3. række) x4", 4)).toBe("A+ (1.-2.-3. række)");
  });

  it("viser alle kategorier med antal, når der er flere", () => {
    expect(kategoriTekst("A+ (1.-2.-3. række) x30, A+ (4.-5.-6. række) x28", 58)).toBe(
      "30 × A+ (1.-2.-3. række), 28 × A+ (4.-5.-6. række)"
    );
  });

  it("giver tom tekst, når kategorien ikke kan læses", () => {
    expect(kategoriTekst("", 2)).toBe("");
    expect(kategoriTekst("noget rod", 2)).toBe("");
  });
});
