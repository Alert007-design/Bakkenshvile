import { describe, it, expect } from "vitest";
import {
  danskTid,
  slotForTime,
  vaelgStory,
  plusDage,
  type ShowInfo,
} from "./plan";

const show = (date: string, extra: Partial<ShowInfo> = {}): ShowInfo => ({
  date,
  time: "20:00",
  tilbage: 100,
  soldOut: false,
  ...extra,
});

describe("dansk tid", () => {
  it("bruger dansk tid om vinteren (UTC+1)", () => {
    expect(danskTid(new Date("2026-11-15T07:25:00Z"))).toEqual({
      dato: "2026-11-15",
      time: 8,
      minut: 25,
    });
  });

  it("bruger dansk sommertid (UTC+2)", () => {
    expect(danskTid(new Date("2027-06-01T14:25:00Z")).time).toBe(16);
  });

  it("skifter dato ved dansk midnat, ikke ved UTC-midnat", () => {
    expect(danskTid(new Date("2026-12-31T23:30:00Z")).dato).toBe("2027-01-01");
  });

  it("finder tidspunktet ud fra timen", () => {
    expect(slotForTime(8)).toBe("morgen");
    expect(slotForTime(16)).toBe("eftermiddag");
    expect(slotForTime(12)).toBeNull();
  });

  it("lægger dage til en dato", () => {
    expect(plusDage("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("morgen-story", () => {
  const saeson2027 = [show("2027-05-10"), show("2027-05-12")];

  it("tæller ned til jubilæumssæsonen", () => {
    const s = vaelgStory("morgen", "2026-11-15", saeson2027)!;
    expect(s.type).toBe("nedtaelling");
    expect(s.hoved).toEqual(["Om 176 dage"]);
    expect(s.underlinje).toBe("begynder jubilæumssæsonen");
    expect(s.overlinje).toBe("150 ÅR · 1877–2027");
  });

  it("siger 'I morgen' dagen før", () => {
    const s = vaelgStory("morgen", "2027-05-09", saeson2027)!;
    expect(s.hoved).toEqual(["I morgen"]);
  });

  it("viser 'I aften' på en spilledag", () => {
    const s = vaelgStory("morgen", "2027-05-12", [show("2027-05-10"), ...saeson2027.slice(1)])!;
    expect(s.type).toBe("i-aften");
    expect(s.hoved).toEqual(["I aften", "kl. 20.00"]);
    expect(s.overlinje).toBe("ONSDAG 12. MAJ");
  });

  it("laver ingen nedtælling midt i sæsonen", () => {
    const shows = [show("2027-05-12"), show("2027-05-14")];
    expect(vaelgStory("morgen", "2027-05-13", shows)).toBeNull();
  });

  it("laver intet, når der ingen forestillinger er", () => {
    expect(vaelgStory("morgen", "2026-11-15", [])).toBeNull();
  });

  it("skifter foto fra dag til dag", () => {
    const a = vaelgStory("morgen", "2026-11-15", saeson2027)!;
    const b = vaelgStory("morgen", "2026-11-16", saeson2027)!;
    expect(a.foto).not.toBe(b.foto);
  });
});

describe("eftermiddags-story", () => {
  const saeson2027 = [show("2027-05-10")];

  it("viser gavekort frem til og med 23. december", () => {
    expect(vaelgStory("eftermiddag", "2026-11-15", saeson2027)!.type).toBe("gavekort");
    expect(vaelgStory("eftermiddag", "2026-12-23", saeson2027)!.type).toBe("gavekort");
  });

  it("viser billetsalget efter jul", () => {
    const s = vaelgStory("eftermiddag", "2026-12-27", saeson2027)!;
    expect(s.type).toBe("billetter");
    expect(s.hoved).toEqual(["Billetter til 2027", "er i salg"]);
    expect(s.underlinje).toBe("Jubilæumssæsonen begynder 10. maj");
  });

  it("viser ledige pladser i aften med antal, når der er få", () => {
    const s = vaelgStory("eftermiddag", "2027-06-02", [show("2027-06-02", { tilbage: 8 })])!;
    expect(s.type).toBe("pladser");
    expect(s.hoved).toEqual(["8 ledige pladser", "i aften kl. 20.00"]);
  });

  it("bruger ental ved én plads", () => {
    const s = vaelgStory("eftermiddag", "2027-06-02", [show("2027-06-02", { tilbage: 1 })])!;
    expect(s.hoved[0]).toBe("1 ledig plads");
  });

  it("viser i morgen, hvis der ikke spilles i aften", () => {
    const s = vaelgStory("eftermiddag", "2027-06-02", [show("2027-06-03", { tilbage: 40 })])!;
    expect(s.hoved).toEqual(["Stadig pladser", "i morgen kl. 20.00"]);
  });

  it("laver ingen story, når der er udsolgt", () => {
    const shows = [show("2027-06-02", { tilbage: 0 }), show("2027-06-03", { soldOut: true })];
    expect(vaelgStory("eftermiddag", "2027-06-02", shows)).toBeNull();
  });

  it("laver ingen story, når antallet ikke kunne hentes", () => {
    expect(vaelgStory("eftermiddag", "2027-06-02", [show("2027-06-02", { tilbage: null })])).toBeNull();
  });
});
