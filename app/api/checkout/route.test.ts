// Tests for dobbeltbooking-advarslen i /api/checkout.
// Det vigtigste: en advarsel opretter ingen kunde, booking, reservation eller
// betaling, og "bekræftet" fungerer som før uden at tjekke igen.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const tjekDobbeltbooking = vi.fn();
const createRecord = vi.fn();
const reserverPladser = vi.fn();

vi.mock("@/lib/dobbeltbooking", async () => {
  const faktisk = await vi.importActual<typeof import("@/lib/dobbeltbooking")>("@/lib/dobbeltbooking");
  return { ...faktisk, tjekDobbeltbooking: (...a: unknown[]) => tjekDobbeltbooking(...a) };
});
vi.mock("@/lib/airtable", async () => {
  const faktisk = await vi.importActual<typeof import("@/lib/airtable")>("@/lib/airtable");
  return {
    ...faktisk,
    cachedListRecords: vi.fn(async () => []),
    createRecord: (...a: unknown[]) => createRecord(...a),
    getRecord: vi.fn(),
  };
});
vi.mock("@/lib/events", () => ({
  getShowDate: vi.fn(async () => ({
    id: "recShow0000000001",
    title: "Show",
    date: "2099-07-03",
    time: "20.00",
    soldOut: false,
    kapacitetsjustering: {},
  })),
}));
vi.mock("@/lib/ticket-checkout", () => ({
  validateTicketCheckout: vi.fn(() => ({
    ok: true,
    totals: { ticketCount: 2, discountKr: 0, totalOre: 52500, discountOre: 0 },
    pladsoensker: [],
    lines: [],
    ticketBreakdown: "A x2",
    addonBreakdown: "",
  })),
}));
vi.mock("@/lib/db", () => ({ getDb: () => ({ query: vi.fn() }) }));
vi.mock("@/lib/seat-holds", () => ({
  frigivForBooking: vi.fn(),
  frigivUdloebne: vi.fn(),
  hentTagne: vi.fn(async () => ({ aplusForrest: 0, aplusBagerst: 0, a: 0, b: 0 })),
  knytBetalingsreference: vi.fn(),
  reserverPladser: (...a: unknown[]) => reserverPladser(...a),
}));

import { POST } from "./route";

function kald(extra: Record<string, unknown> = {}, email: string | undefined = "gaest@eksempel.dk") {
  return new NextRequest("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customer: { name: "Test Gæst", email, phone: "", address: "Vej 1", zip: "2800", city: "Lyngby" },
      showId: "recShow0000000001",
      tickets: [{ ticketTypeId: "recT1", quantity: 2 }],
      addons: [],
      acceptTerms: true,
      ...extra,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Stopper forløbet lige efter tjekket: det første, der oprettes, fejler.
  createRecord.mockRejectedValue(new Error("stop her"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/checkout og dobbeltbooking", () => {
  it("advarer og opretter INTET, når der er en dobbeltbooking", async () => {
    tjekDobbeltbooking.mockResolvedValue(true);
    const res = await POST(kald());
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data).toEqual({ dobbeltbooking: true });
    expect(createRecord).not.toHaveBeenCalled();
    expect(reserverPladser).not.toHaveBeenCalled();
  });

  it("svaret afslører intet om den første booking", async () => {
    tjekDobbeltbooking.mockResolvedValue(true);
    const tekst = JSON.stringify(await (await POST(kald())).json());
    expect(tekst).not.toMatch(/BH-|rec[A-Za-z0-9]{14}|gaest|Test|kr/i);
  });

  it("sender tjekket den normaliserede forestilling og det rigtige antal", async () => {
    tjekDobbeltbooking.mockResolvedValue(false);
    await POST(kald());
    expect(tjekDobbeltbooking).toHaveBeenCalledTimes(1);
    expect(tjekDobbeltbooking.mock.calls[0][1]).toEqual({
      email: "gaest@eksempel.dk",
      showId: "recShow0000000001",
      antal: 2,
    });
  });

  it("uden advarsel fortsætter købet som i dag (kunden oprettes)", async () => {
    tjekDobbeltbooking.mockResolvedValue(false);
    await POST(kald());
    expect(createRecord).toHaveBeenCalledTimes(1);
  });

  it("BESTIL ALLIGEVEL: tjekker ikke igen og fortsætter som i dag", async () => {
    tjekDobbeltbooking.mockResolvedValue(true);
    await POST(kald({ bekraeftDobbeltbooking: true }));
    expect(tjekDobbeltbooking).not.toHaveBeenCalled();
    expect(createRecord).toHaveBeenCalledTimes(1);
  });

  it("kun en ægte true springer tjekket over (ikke teksten 'true')", async () => {
    tjekDobbeltbooking.mockResolvedValue(true);
    const res = await POST(kald({ bekraeftDobbeltbooking: "true" }));
    expect(res.status).toBe(409);
  });

  it("uden e-mail (kun telefon) sker der intet tjek", async () => {
    tjekDobbeltbooking.mockResolvedValue(true);
    await POST(kald({ customer: { name: "Test", phone: "12345678", address: "Vej 1", zip: "2800", city: "Lyngby" } }));
    expect(tjekDobbeltbooking).not.toHaveBeenCalled();
    expect(createRecord).toHaveBeenCalledTimes(1);
  });

  it("selv hvis tjekket kaster, fortsætter købet", async () => {
    tjekDobbeltbooking.mockRejectedValue(new Error("uventet"));
    await POST(kald());
    expect(createRecord).toHaveBeenCalledTimes(1);
  });
});
