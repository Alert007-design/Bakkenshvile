import { describe, it, expect } from "vitest";
import {
  BOOKING_ALPHABET,
  generateBookingNo,
  normalizeBookingNo,
} from "@/lib/booking-no";

describe("generateBookingNo", () => {
  it("giver BH- efterfulgt af 8 tegn fra det sikre alfabet", () => {
    for (let i = 0; i < 200; i++) {
      const no = generateBookingNo();
      expect(no).toMatch(/^BH-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
    }
  });

  it("bruger aldrig tegn, der kan forveksles (0, O, 1, I, L)", () => {
    expect(BOOKING_ALPHABET).not.toMatch(/[01OIL]/);
    expect(BOOKING_ALPHABET.length).toBe(31);
  });

  it("kan bruge et andet præfiks til fribilletter", () => {
    expect(generateBookingNo("BH-FRI-")).toMatch(
      /^BH-FRI-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/
    );
  });

  it("er tilfældigt og ikke afledt af klokkeslættet", () => {
    const set = new Set(Array.from({ length: 2000 }, () => generateBookingNo()));
    expect(set.size).toBe(2000);
    // Det gamle format var rene cifre: BH-12345678.
    const kunCifre = [...set].filter((n) => /^BH-\d{8}$/.test(n));
    expect(kunCifre.length).toBeLessThan(5);
  });

  it("matcher det format, Airtable-opslaget tillader", () => {
    expect(generateBookingNo()).toMatch(/^[A-Za-z0-9-]{1,40}$/);
    expect(generateBookingNo("BH-FRI-")).toMatch(/^[A-Za-z0-9-]{1,40}$/);
  });
});

describe("normalizeBookingNo", () => {
  it("fjerner mellemrum og gør bogstaver store", () => {
    expect(normalizeBookingNo("  bh-k7m2q9xr ")).toBe("BH-K7M2Q9XR");
  });

  it("lader gamle numre med cifre være uændrede", () => {
    expect(normalizeBookingNo("BH-31608747")).toBe("BH-31608747");
  });

  it("håndterer tom eller manglende værdi", () => {
    expect(normalizeBookingNo(undefined)).toBe("");
    expect(normalizeBookingNo("")).toBe("");
  });
});
