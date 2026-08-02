import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "crypto";
import {
  createStaffSession,
  verifyStaffSession,
  checkStaffPassword,
  verifyCsrf,
} from "@/lib/staff-auth";

const SECRET = "test-staff-secret";

beforeEach(() => {
  process.env.STAFF_SESSION_SECRET = SECRET;
  process.env.STAFF_PASSWORD = "faelles-kode-123";
});

describe("staff-session", () => {
  it("kan oprettes og verificeres", () => {
    const s = createStaffSession();
    const v = verifyStaffSession(s.value);
    expect(v).not.toBeNull();
    expect(v!.csrf).toBe(s.csrf);
  });

  it("indeholder ikke adgangskoden", () => {
    const s = createStaffSession();
    expect(s.value).not.toContain("faelles-kode-123");
  });

  it("afviser en forfalsket cookie", () => {
    const s = createStaffSession();
    expect(verifyStaffSession(s.value.slice(0, -3) + "xxx")).toBeNull();
  });

  it("afviser skrald og manglende cookie", () => {
    expect(verifyStaffSession(undefined)).toBeNull();
    expect(verifyStaffSession("")).toBeNull();
    expect(verifyStaffSession("ingen-prik")).toBeNull();
  });

  it("afviser en udløbet session og sender brugeren til login", () => {
    const now = 1_000_000;
    const s = createStaffSession(now);
    expect(verifyStaffSession(s.value, now + 9 * 60 * 60 * 1000)).toBeNull();
    expect(verifyStaffSession(s.value, now + 1000)).not.toBeNull();
  });

  it("kan ikke verificeres med en anden secret", () => {
    const s = createStaffSession();
    process.env.STAFF_SESSION_SECRET = "en-anden-secret";
    expect(verifyStaffSession(s.value)).toBeNull();
  });
});

describe("adgangskode", () => {
  it("accepterer korrekt kode og afviser forkert", () => {
    expect(checkStaffPassword("faelles-kode-123")).toBe(true);
    expect(checkStaffPassword("forkert")).toBe(false);
    expect(checkStaffPassword("")).toBe(false);
    expect(checkStaffPassword(null)).toBe(false);
  });
});

describe("CSRF", () => {
  it("kræver at header-token matcher sessionens", () => {
    const s = createStaffSession();
    const session = verifyStaffSession(s.value)!;
    expect(verifyCsrf(session, s.csrf)).toBe(true);
    expect(verifyCsrf(session, "forkert")).toBe(false);
    expect(verifyCsrf(session, null)).toBe(false);
    expect(verifyCsrf(null, s.csrf)).toBe(false);
  });
});

// Sikrer at Edge-verifikationen i middleware.ts (Web Crypto + base64url) giver
// præcis samme signatur som Node-signeringen i staff-auth.ts, så det centrale
// chokepunkt og rute-verifikationen er enige om token-formatet.
describe("edge/node token-format", () => {
  function bytesToBase64url(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  it("Web Crypto HMAC matcher Node HMAC (base64url)", async () => {
    const payload = "eyJleHAiOjEsImNzcmYiOiJhYmMifQ";
    const nodeSig = createHmac("sha256", SECRET).update(payload).digest("base64url");

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const edgeSig = bytesToBase64url(new Uint8Array(mac));

    expect(edgeSig).toBe(nodeSig);
  });
});
