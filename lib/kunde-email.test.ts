// Tests for rettelse af en kundes email fra opslagssiden.

import { describe, it, expect, vi } from "vitest";
import { FIELDS } from "@/lib/airtable";
import { retKundeEmail, tjekEmail, type RetEmailDeps } from "@/lib/kunde-email";

describe("tjekEmail", () => {
  it("godtager en almindelig adresse og retter store bogstaver og luft", () => {
    expect(tjekEmail("  Hans.Jensen@Gmail.com ")).toEqual({ ok: true, email: "hans.jensen@gmail.com" });
  });

  it.each(["", "hans", "hans@", "@gmail.com", "hans@gmail", "hans jensen@gmail.com", "hans@@gmail.com"])(
    "afviser %s",
    (input) => {
      expect(tjekEmail(input).ok).toBe(false);
    }
  );

  it.each([
    ["hans@firma.dl", "hans@firma.dk"],
    ["hans@firma.dkk", "hans@firma.dk"],
    ["hans@gmail.con", "hans@gmail.com"],
    ["hans@gmail.cmo", "hans@gmail.com"],
    ["hans@gmial.com", "hans@gmail.com"],
    ["hans@gamil.com", "hans@gmail.com"],
    ["hans@gmail.dk", "hans@gmail.com"],
    ["hans@hotmial.com", "hans@hotmail.com"],
    ["hans@hotmail.dl", "hans@hotmail.dk"],
    ["hans@outlok.dk", "hans@outlook.dk"],
    ["hans@icloud.dk", "hans@icloud.com"],
    ["hans@yahoo.con", "hans@yahoo.com"],
  ])("foreslår en rettelse af %s", (input, forslag) => {
    const r = tjekEmail(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.forslag).toBe(forslag);
  });

  it.each(["hans@gmail.com", "hans@hotmail.dk", "hans@firma.dk", "hans@live.dk", "hans@firma.se"])(
    "giver ingen advarsel ved %s",
    (input) => {
      const r = tjekEmail(input);
      expect(r).toEqual({ ok: true, email: input });
    }
  );
});

const BOOKING = "recBooking0000001";
const KUNDE = "recKunde000000001";

function deps(over: Partial<RetEmailDeps> = {}): RetEmailDeps {
  return {
    hentBooking: vi.fn(async () => ({ id: BOOKING, fields: { [FIELDS.booking.customer]: [KUNDE] } })),
    hentKunde: vi.fn(async () => ({
      id: KUNDE,
      fields: {
        [FIELDS.customer.email]: "hans@firma.dl",
        [FIELDS.customer.bookings]: [BOOKING, "recBooking0000002"],
      },
    })),
    opdaterKunde: vi.fn(async () => {}),
    log: vi.fn(),
    ...over,
  };
}

describe("retKundeEmail", () => {
  it("retter emailen på kundekortet og siger, hvor mange bookinger det gælder", async () => {
    const d = deps();
    const r = await retKundeEmail(d, BOOKING, "hans@firma.dk");
    expect(r).toEqual({ ok: true, email: "hans@firma.dk", antalBookinger: 2 });
    expect(d.opdaterKunde).toHaveBeenCalledWith(KUNDE, { [FIELDS.customer.email]: "hans@firma.dk" });
  });

  it("afviser en ugyldig adresse uden at røre Airtable", async () => {
    const d = deps();
    const r = await retKundeEmail(d, BOOKING, "hans@firma");
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(d.hentBooking).not.toHaveBeenCalled();
    expect(d.opdaterKunde).not.toHaveBeenCalled();
  });

  it("beder om bekræftelse ved en mulig tastefejl og gemmer ikke", async () => {
    const d = deps();
    const r = await retKundeEmail(d, BOOKING, "hans@gmial.com");
    expect(r).toMatchObject({ ok: false, status: 409, forslag: "hans@gmail.com" });
    expect(d.opdaterKunde).not.toHaveBeenCalled();
  });

  it("gemmer den mulige tastefejl, når personalet har bekræftet", async () => {
    const d = deps();
    const r = await retKundeEmail(d, BOOKING, "hans@gmial.com", true);
    expect(r.ok).toBe(true);
    expect(d.opdaterKunde).toHaveBeenCalledWith(KUNDE, { [FIELDS.customer.email]: "hans@gmial.com" });
  });

  it("afviser, når adressen er den samme som før", async () => {
    const d = deps({
      hentKunde: vi.fn(async () => ({ id: KUNDE, fields: { [FIELDS.customer.email]: "Hans@Firma.dk" } })),
    });
    const r = await retKundeEmail(d, BOOKING, "hans@firma.dk");
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(d.opdaterKunde).not.toHaveBeenCalled();
  });

  it("svarer 404, når bookingen ikke findes", async () => {
    const d = deps({ hentBooking: vi.fn(async () => null) });
    expect(await retKundeEmail(d, BOOKING, "hans@firma.dk")).toMatchObject({ ok: false, status: 404 });
  });

  it("svarer 404, når bookingen ikke har et kundekort", async () => {
    const d = deps({ hentBooking: vi.fn(async () => ({ id: BOOKING, fields: {} })) });
    expect(await retKundeEmail(d, BOOKING, "hans@firma.dk")).toMatchObject({ ok: false, status: 404 });
    expect(d.opdaterKunde).not.toHaveBeenCalled();
  });

  it("siger tydeligt til, når Airtable fejler, og skriver ikke adresserne i loggen", async () => {
    const d = deps({
      opdaterKunde: vi.fn(async () => {
        throw new Error("nede");
      }),
    });
    const r = await retKundeEmail(d, BOOKING, "hans@firma.dk");
    expect(r).toMatchObject({ ok: false, status: 502 });
    const logget = JSON.stringify((d.log as ReturnType<typeof vi.fn>).mock.calls);
    expect(logget).not.toContain("hans@");
  });
});
