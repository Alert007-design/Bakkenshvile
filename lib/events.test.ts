import { describe, it, expect, afterEach, vi } from "vitest";
import { danishToday, isUpcoming, toShowDate, getShowDate } from "@/lib/events";
import { FIELDS, type AirtableRecord } from "@/lib/airtable";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("danishToday — dansk kalenderdag uafhængigt af serverens UTC", () => {
  it("sommertid (UTC+2): sent på aftenen dansk tid er allerede næste dag", () => {
    // 21:30 UTC = 23:30 dansk (CEST) → stadig 1. august.
    expect(danishToday(new Date("2026-08-01T21:30:00Z"))).toBe("2026-08-01");
    // 22:30 UTC = 00:30 dansk → rullet over til 2. august.
    expect(danishToday(new Date("2026-08-01T22:30:00Z"))).toBe("2026-08-02");
  });

  it("vintertid (UTC+1): midnat dansk tid ruller dagen én dag frem", () => {
    expect(danishToday(new Date("2026-01-01T22:30:00Z"))).toBe("2026-01-01");
    expect(danishToday(new Date("2026-01-01T23:30:00Z"))).toBe("2026-01-02");
  });
});

describe("isUpcoming — showdagen selv tæller med", () => {
  it("er sand på selve showdagen og for fremtidige datoer", () => {
    expect(isUpcoming("2026-08-01", "2026-08-01")).toBe(true);
    expect(isUpcoming("2026-08-02", "2026-08-01")).toBe(true);
  });

  it("er falsk for afholdte datoer", () => {
    expect(isUpcoming("2026-07-31", "2026-08-01")).toBe(false);
  });

  it("virker korrekt over årsskiftet", () => {
    expect(isUpcoming("2027-01-01", "2026-12-31")).toBe(true);
    expect(isUpcoming("2026-12-31", "2027-01-01")).toBe(false);
  });

  it("omkring midnat dansk tid: samme show er kommende før midnat, afholdt efter", () => {
    // Show 1. august. Kl. 21:30 UTC er det stadig 1. august i Danmark.
    const foerMidnat = danishToday(new Date("2026-08-01T21:30:00Z"));
    expect(isUpcoming("2026-08-01", foerMidnat)).toBe(true);
    // Kl. 22:30 UTC er klokken passeret midnat i Danmark → 2. august.
    const efterMidnat = danishToday(new Date("2026-08-01T22:30:00Z"));
    expect(isUpcoming("2026-08-01", efterMidnat)).toBe(false);
  });

  it("tom eller ugyldig dato regnes aldrig som kommende", () => {
    expect(isUpcoming("", "2026-08-01")).toBe(false);
    expect(isUpcoming("ikke-en-dato", "2026-08-01")).toBe(false);
  });
});

describe("toShowDate — tåler manglende felter", () => {
  it("giver fornuftige standardværdier når felterne mangler", () => {
    const record: AirtableRecord = { id: "rec12345678901234", fields: {} };
    const show = toShowDate(record);
    expect(show).toEqual({
      id: "rec12345678901234",
      title: "Kommende show",
      date: "",
      time: "",
      duration: "",
      notes: "",
      priceGroup: "",
      soldOut: false,
    });
  });

  it("mapper de felter der er sat", () => {
    const record: AirtableRecord = {
      id: "rec12345678901234",
      fields: {
        [FIELDS.event.title]: "Forpremiere",
        [FIELDS.event.date]: "2026-05-13",
        [FIELDS.event.time]: "19:00",
        [FIELDS.event.priceGroup]: { id: "sel1", name: "Ordinær", color: "blue" },
        [FIELDS.event.soldOut]: true,
      },
    };
    const show = toShowDate(record);
    expect(show.title).toBe("Forpremiere");
    expect(show.date).toBe("2026-05-13");
    expect(show.time).toBe("19:00");
    expect(show.priceGroup).toBe("Ordinær");
    expect(show.soldOut).toBe(true);
  });
});

describe("getShowDate — afviser ugyldigt id uden netværkskald", () => {
  it("returnerer null for et forkert-formateret id og rører aldrig Airtable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getShowDate("ikke-et-rigtigt-id")).toBeNull();
    expect(await getShowDate("")).toBeNull();
    expect(await getShowDate("rec123")).toBeNull(); // for kort
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
