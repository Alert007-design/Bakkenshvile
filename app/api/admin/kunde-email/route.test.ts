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
import { FIELDS, TABLES } from "@/lib/airtable";

const ID = "recBooking0000001";
const KUNDE = "recKunde000000001";

function kald(body: unknown) {
  return new NextRequest("http://localhost/api/admin/kunde-email", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "staff=x", "x-csrf-token": "t" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyStaffSession.mockReturnValue({ csrf: "t" });
  verifyCsrf.mockReturnValue(true);
  getRecord.mockImplementation(async (tabel: string) =>
    tabel === TABLES.bookings
      ? { id: ID, fields: { [FIELDS.booking.customer]: [KUNDE] } }
      : { id: KUNDE, fields: { [FIELDS.customer.email]: "hans@firma.dl" } }
  );
  updateRecord.mockResolvedValue({});
});

describe("POST /api/admin/kunde-email", () => {
  it("kræver login", async () => {
    verifyStaffSession.mockReturnValue(null);
    expect((await POST(kald({ bookingId: ID, email: "hans@firma.dk" }))).status).toBe(401);
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("kræver gyldigt csrf-tegn", async () => {
    verifyCsrf.mockReturnValue(false);
    expect((await POST(kald({ bookingId: ID, email: "hans@firma.dk" }))).status).toBe(403);
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("retter emailen på kundekortet", async () => {
    const res = await POST(kald({ bookingId: ID, email: "hans@firma.dk" }));
    expect(res.status).toBe(200);
    expect(updateRecord).toHaveBeenCalledWith(TABLES.customers, KUNDE, {
      [FIELDS.customer.email]: "hans@firma.dk",
    });
  });

  it("sender forslaget med ved en mulig tastefejl", async () => {
    const res = await POST(kald({ bookingId: ID, email: "hans@gmial.com" }));
    expect(res.status).toBe(409);
    expect((await res.json()).forslag).toBe("hans@gmail.com");
    expect(updateRecord).not.toHaveBeenCalled();
  });
});
