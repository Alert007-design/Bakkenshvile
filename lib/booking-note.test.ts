// Tests for personalets noter på en booking (opslagssiden).

import { describe, it, expect, vi } from "vitest";
import { FIELDS } from "@/lib/airtable";
import { kundeBemaerkning } from "@/lib/gaesteliste";
import {
  NOTE_MAKS,
  personaleNoteLinje,
  rensNote,
  tilfoejPersonalenote,
  type NoteDeps,
} from "@/lib/booking-note";

const BOOKING = "recBooking0000001";
// 11-11-2026 kl. 19.40 dansk tid (UTC+1).
const NU = new Date("2026-11-11T18:40:00Z");

function deps(fields: Record<string, unknown> | null, over: Partial<NoteDeps> = {}): NoteDeps {
  return {
    hentBooking: vi.fn(async () => (fields ? { id: BOOKING, fields } : null)),
    opdaterBooking: vi.fn(async () => {}),
    nu: () => NU,
    log: vi.fn(),
    ...over,
  };
}

describe("rensNote", () => {
  it("fjerner luft og linjeskift", () => {
    expect(rensNote("  Rullestol \n ved udgangen  ")).toBe("Rullestol ved udgangen");
  });
  it("erstatter den lodrette streg, så noten ikke deles i to", () => {
    expect(rensNote("A | B")).toBe("A / B");
  });
  it("giver tom tekst for tom eller manglende note", () => {
    expect(rensNote("   ")).toBe("");
    expect(rensNote(undefined)).toBe("");
    expect(rensNote(42)).toBe("");
  });
});

describe("personaleNoteLinje", () => {
  it("sætter dansk dato og klokkeslæt foran", () => {
    expect(personaleNoteLinje("Rullestol", NU)).toBe("Note 11-11-2026 kl. 19.40: Rullestol");
  });
  it("bliver vist som bemærkning på gæstelisten", () => {
    expect(kundeBemaerkning(`Show: 20. maj — Vegetar | ${personaleNoteLinje("Rullestol", NU)}`)).toContain(
      "Rullestol"
    );
  });
});

describe("tilfoejPersonalenote", () => {
  it("lægger noten efter det, der står i forvejen", async () => {
    const d = deps({ [FIELDS.booking.specialRequests]: "Show: 20. maj — Vegetar" });
    const r = await tilfoejPersonalenote(d, BOOKING, "Rullestol");
    expect(r.ok).toBe(true);
    expect(d.opdaterBooking).toHaveBeenCalledWith(BOOKING, {
      [FIELDS.booking.specialRequests]: "Show: 20. maj — Vegetar | Note 11-11-2026 kl. 19.40: Rullestol",
    });
  });

  it("skriver noten alene, når feltet er tomt", async () => {
    const d = deps({});
    await tilfoejPersonalenote(d, BOOKING, "Rullestol");
    expect(d.opdaterBooking).toHaveBeenCalledWith(BOOKING, {
      [FIELDS.booking.specialRequests]: "Note 11-11-2026 kl. 19.40: Rullestol",
    });
  });

  it("afviser en tom note uden at røre Airtable", async () => {
    const d = deps({});
    const r = await tilfoejPersonalenote(d, BOOKING, "   ");
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(d.hentBooking).not.toHaveBeenCalled();
    expect(d.opdaterBooking).not.toHaveBeenCalled();
  });

  it("afviser en for lang note", async () => {
    const d = deps({});
    const r = await tilfoejPersonalenote(d, BOOKING, "x".repeat(NOTE_MAKS + 1));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(d.opdaterBooking).not.toHaveBeenCalled();
  });

  it("svarer 404, når bookingen ikke findes", async () => {
    const d = deps(null);
    const r = await tilfoejPersonalenote(d, BOOKING, "Rullestol");
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(d.opdaterBooking).not.toHaveBeenCalled();
  });

  it("siger tydeligt til, når Airtable fejler", async () => {
    const d = deps({}, {
      opdaterBooking: vi.fn(async () => {
        throw new Error("nede");
      }),
    });
    const r = await tilfoejPersonalenote(d, BOOKING, "Rullestol");
    expect(r).toMatchObject({ ok: false, status: 502 });
    if (!r.ok) expect(r.error).toMatch(/ikke gemt/i);
    expect(d.log).toHaveBeenCalled();
  });

  it("returnerer hele feltet, som det står nu", async () => {
    const d = deps({ [FIELDS.booking.specialRequests]: "Vegetar" });
    const r = await tilfoejPersonalenote(d, BOOKING, "Rullestol");
    expect(r).toEqual({ ok: true, saerligeOensker: "Vegetar | Note 11-11-2026 kl. 19.40: Rullestol" });
  });
});
