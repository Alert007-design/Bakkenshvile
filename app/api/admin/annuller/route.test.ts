import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const verifyStaffSession = vi.fn();
const verifyCsrf = vi.fn();
const getRecord = vi.fn();
const updateRecord = vi.fn();
const annullerPladser = vi.fn();

vi.mock("@/lib/staff-auth", () => ({
  STAFF_COOKIE_NAME: "staff",
  verifyStaffSession: (...a: unknown[]) => verifyStaffSession(...a),
  verifyCsrf: (...a: unknown[]) => verifyCsrf(...a),
}));
vi.mock("@/lib/airtable", async () => {
  const faktisk = await vi.importActual<typeof import("@/lib/airtable")>("@/lib/airtable");
  return {
    ...faktisk,
    getRecord: (...a: unknown[]) => getRecord(...a),
    updateRecord: (...a: unknown[]) => updateRecord(...a),
  };
});
vi.mock("@/lib/db", () => ({
  getDb: () => ({ query: vi.fn(async () => ({ rows: [{ expected_total_ore: 52500 }] })) }),
}));
vi.mock("@/lib/seat-holds", () => ({
  annullerPladser: (...a: unknown[]) => annullerPladser(...a),
}));

import { POST } from "./route";
import { FIELDS } from "@/lib/airtable";

const ID = "recBooking0000001";

function kald(body: unknown) {
  return new NextRequest("http://localhost/api/admin/annuller", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "staff=x", "x-csrf-token": "t" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyStaffSession.mockReturnValue({ csrf: "t" });
  verifyCsrf.mockReturnValue(true);
  getRecord.mockResolvedValue({
    id: ID,
    fields: { [FIELDS.booking.bookingNo]: "BH-K7M2Q9XR", [FIELDS.booking.status]: "Betalt" },
  });
  updateRecord.mockResolvedValue({});
  annullerPladser.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/admin/annuller", () => {
  it("kræver personale-login", async () => {
    verifyStaffSession.mockReturnValue(null);
    const res = await POST(kald({ bookingId: ID }));
    expect(res.status).toBe(401);
    expect(updateRecord).not.toHaveBeenCalled();
    expect(annullerPladser).not.toHaveBeenCalled();
  });

  it("kræver gyldigt csrf-tegn", async () => {
    verifyCsrf.mockReturnValue(false);
    const res = await POST(kald({ bookingId: ID }));
    expect(res.status).toBe(403);
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("afviser et ugyldigt booking-id", async () => {
    const res = await POST(kald({ bookingId: "x\" OR 1=1" }));
    expect(res.status).toBe(400);
    expect(getRecord).not.toHaveBeenCalled();
  });

  it("annullerer en betalt booking og svarer med beløbet", async () => {
    const res = await POST(kald({ bookingId: ID }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ ok: true, bookingNo: "BH-K7M2Q9XR", beloebKr: 525, beloebKilde: "viva", pladserFrigivet: true });
    expect(updateRecord).toHaveBeenCalledTimes(1);
    expect(annullerPladser).toHaveBeenCalledTimes(1);
  });

  it("annullerer ikke to gange", async () => {
    getRecord.mockResolvedValue({
      id: ID,
      fields: { [FIELDS.booking.bookingNo]: "BH-K7M2Q9XR", [FIELDS.booking.status]: "Annulleret" },
    });
    const res = await POST(kald({ bookingId: ID }));
    expect(res.status).toBe(409);
    expect(updateRecord).not.toHaveBeenCalled();
  });
});
