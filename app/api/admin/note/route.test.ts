import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const verifyStaffSession = vi.fn();
const verifyCsrf = vi.fn();
const getRecord = vi.fn();
const updateRecord = vi.fn();

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

import { POST } from "./route";
import { FIELDS } from "@/lib/airtable";

const ID = "recBooking0000001";

function kald(body: unknown) {
  return new NextRequest("http://localhost/api/admin/note", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "staff=x", "x-csrf-token": "t" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyStaffSession.mockReturnValue({ csrf: "t" });
  verifyCsrf.mockReturnValue(true);
  getRecord.mockResolvedValue({ id: ID, fields: { [FIELDS.booking.specialRequests]: "Vegetar" } });
  updateRecord.mockResolvedValue({});
});

describe("POST /api/admin/note", () => {
  it("kræver login", async () => {
    verifyStaffSession.mockReturnValue(null);
    const res = await POST(kald({ bookingId: ID, note: "Hej" }));
    expect(res.status).toBe(401);
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("kræver gyldigt csrf-tegn", async () => {
    verifyCsrf.mockReturnValue(false);
    const res = await POST(kald({ bookingId: ID, note: "Hej" }));
    expect(res.status).toBe(403);
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("afviser et ugyldigt booking-id", async () => {
    const res = await POST(kald({ bookingId: "abc", note: "Hej" }));
    expect(res.status).toBe(400);
    expect(getRecord).not.toHaveBeenCalled();
  });

  it("gemmer noten bagerst i Særlige ønsker", async () => {
    const res = await POST(kald({ bookingId: ID, note: "Rullestol" }));
    expect(res.status).toBe(200);
    const [, , felter] = updateRecord.mock.calls[0];
    expect(felter[FIELDS.booking.specialRequests]).toMatch(/^Vegetar \| Note \d\d-\d\d-\d{4} kl\. \d\d\.\d\d: Rullestol$/);
  });

  it("svarer 502, når Airtable fejler", async () => {
    updateRecord.mockRejectedValue(new Error("nede"));
    const res = await POST(kald({ bookingId: ID, note: "Rullestol" }));
    expect(res.status).toBe(502);
  });
});
