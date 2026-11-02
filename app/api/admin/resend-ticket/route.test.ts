import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getRecord = vi.fn();
const sendMail = vi.fn();

vi.mock("@/lib/staff-auth", () => ({
  STAFF_COOKIE_NAME: "staff",
  verifyStaffSession: () => ({ csrf: "t" }),
  verifyCsrf: () => true,
}));
vi.mock("@/lib/airtable", async () => {
  const faktisk = await vi.importActual<typeof import("@/lib/airtable")>("@/lib/airtable");
  return { ...faktisk, getRecord: (...a: unknown[]) => getRecord(...a) };
});
vi.mock("@/lib/db", () => ({ getDb: () => ({ query: vi.fn(async () => ({ rows: [] })) }) }));
vi.mock("@/lib/resend", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));

import { POST } from "./route";
import { FIELDS } from "@/lib/airtable";

beforeEach(() => vi.clearAllMocks());

describe("gensend billet", () => {
  it("afviser en annulleret booking og sender ingen mail", async () => {
    getRecord.mockResolvedValue({
      id: "recBooking0000001",
      fields: { [FIELDS.booking.bookingNo]: "BH-K7M2Q9XR", [FIELDS.booking.status]: "Annulleret" },
    });
    const res = await POST(
      new NextRequest("http://localhost/api/admin/resend-ticket", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "staff=x", "x-csrf-token": "t" },
        body: JSON.stringify({ bookingId: "recBooking0000001" }),
      })
    );
    expect(res.status).toBe(409);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
