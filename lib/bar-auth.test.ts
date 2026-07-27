import { describe, it, expect, beforeEach } from "vitest";
import {
  createBarSession,
  verifyBarSession,
  checkBarPassword,
  verifyCsrf,
} from "@/lib/bar-auth";

beforeEach(() => {
  process.env.BAR_SESSION_SECRET = "test-session-secret";
  process.env.BAR_SCREEN_PASSWORD = "hemmeligt123";
});

describe("barsession", () => {
  it("kan oprettes og verificeres", () => {
    const s = createBarSession();
    const v = verifyBarSession(s.value);
    expect(v).not.toBeNull();
    expect(v!.csrf).toBe(s.csrf);
  });

  it("indeholder ikke adgangskoden", () => {
    const s = createBarSession();
    expect(s.value).not.toContain("hemmeligt123");
  });

  it("afviser en forfalsket cookie", () => {
    const s = createBarSession();
    const tampered = s.value.slice(0, -3) + "xxx";
    expect(verifyBarSession(tampered)).toBeNull();
  });

  it("afviser skrald og manglende cookie", () => {
    expect(verifyBarSession(undefined)).toBeNull();
    expect(verifyBarSession("")).toBeNull();
    expect(verifyBarSession("ingen-prik")).toBeNull();
  });

  it("afviser en udløbet session", () => {
    const now = 1_000_000;
    const s = createBarSession(now);
    // langt efter TTL (8 timer)
    expect(verifyBarSession(s.value, now + 9 * 60 * 60 * 1000)).toBeNull();
    // stadig gyldig lige efter oprettelse
    expect(verifyBarSession(s.value, now + 1000)).not.toBeNull();
  });

  it("kan ikke verificeres med en anden secret", () => {
    const s = createBarSession();
    process.env.BAR_SESSION_SECRET = "en-anden-secret";
    expect(verifyBarSession(s.value)).toBeNull();
  });
});

describe("adgangskode", () => {
  it("accepterer korrekt kode og afviser forkert", () => {
    expect(checkBarPassword("hemmeligt123")).toBe(true);
    expect(checkBarPassword("forkert")).toBe(false);
    expect(checkBarPassword("")).toBe(false);
    expect(checkBarPassword(null)).toBe(false);
  });
});

describe("CSRF", () => {
  it("kræver at header-token matcher sessionens", () => {
    const s = createBarSession();
    const session = verifyBarSession(s.value)!;
    expect(verifyCsrf(session, s.csrf)).toBe(true);
    expect(verifyCsrf(session, "forkert")).toBe(false);
    expect(verifyCsrf(session, null)).toBe(false);
    expect(verifyCsrf(null, s.csrf)).toBe(false);
  });
});
