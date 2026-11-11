import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const verifyStaffSession = vi.fn();
const verifyCsrf = vi.fn();
const flytBooking = vi.fn();

vi.mock("@/lib/staff-auth", () => ({
  STAFF_COOKIE_NAME: "staff",
  verifyStaffSession: (...a: unknown[]) => verifyStaffSession(...a),
  verifyCsrf: (...a: unknown[]) => verifyCsrf(...a),
}));
vi.mock("@/lib/payments/viva-client", () => ({ vivaSourceCode: () => "6238" }));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ query: vi.fn() }) }));
vi.mock("@/lib/flyt-booking", () => ({
  flytBooking: (...a: unknown[]) => flytBooking(...a),
  beregnPrisforskel: vi.fn(),
}));

import { GET, POST } from "./route";

const BOOKING = "recBooking0000001";
const SHOW = "recShowTil0000001";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/admin/flyt", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "staff=x", "x-csrf-token": "t" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyStaffSession.mockReturnValue({ csrf: "t" });
  verifyCsrf.mockReturnValue(true);
  flytBooking.mockResolvedValue({ ok: true, bookingNo: "BH-1", advarsler: [] });
});

describe("/api/admin/flyt", () => {
  it("POST kræver login", async () => {
    verifyStaffSession.mockReturnValue(null);
    expect((await POST(post({ bookingId: BOOKING, showId: SHOW }))).status).toBe(401);
    expect(flytBooking).not.toHaveBeenCalled();
  });

  it("POST kræver gyldigt csrf-tegn", async () => {
    verifyCsrf.mockReturnValue(false);
    expect((await POST(post({ bookingId: BOOKING, showId: SHOW }))).status).toBe(403);
    expect(flytBooking).not.toHaveBeenCalled();
  });

  it("POST afviser ugyldige id'er", async () => {
    expect((await POST(post({ bookingId: BOOKING, showId: "abc" }))).status).toBe(400);
    expect(flytBooking).not.toHaveBeenCalled();
  });

  it("POST flytter og sender svaret videre", async () => {
    const res = await POST(post({ bookingId: BOOKING, showId: SHOW }));
    expect(res.status).toBe(200);
    expect(flytBooking.mock.calls[0].slice(1)).toEqual([BOOKING, SHOW]);
  });

  it("POST sender en afvisning videre med dens status", async () => {
    flytBooking.mockResolvedValue({ ok: false, status: 409, error: "Der er ikke plads" });
    const res = await POST(post({ bookingId: BOOKING, showId: SHOW }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/ikke plads/);
  });

  it("GET kræver login", async () => {
    verifyStaffSession.mockReturnValue(null);
    const res = await GET(new NextRequest(`http://localhost/api/admin/flyt?bookingId=${BOOKING}`));
    expect(res.status).toBe(401);
  });
});
