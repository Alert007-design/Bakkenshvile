import { describe, it, expect, beforeAll } from "vitest";

// Hemmeligheden skal sættes FØR modulet under test importeres, da funktionerne
// læser den fra env ved kald. Vi importerer derfor dynamisk i beforeAll.
let mod: typeof import("@/lib/table-tokens");
let sheet: typeof import("@/lib/qr-sheet");
let tables: typeof import("@/lib/tables");

beforeAll(async () => {
  process.env.TABLE_QR_SECRET = "test-secret-abc123-do-not-use-in-prod";
  mod = await import("@/lib/table-tokens");
  sheet = await import("@/lib/qr-sheet");
  tables = await import("@/lib/tables");
});

describe("QR-token", () => {
  it("er mindst 16 base64url-tegn", () => {
    const t = mod.tableToken(63);
    expect(t.length).toBeGreaterThanOrEqual(mod.MIN_TOKEN_LENGTH);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
  });

  it("er deterministisk for samme bord+version", () => {
    expect(mod.tableToken(63)).toBe(mod.tableToken(63));
  });

  it("verificerer et korrekt token for det rigtige bord", () => {
    const t = mod.tableToken(63);
    expect(mod.verifyTableToken(63, t)).toBe(true);
  });

  it("afviser et token brugt på et andet bord (manipuleret bordnummer)", () => {
    const t = mod.tableToken(63);
    expect(mod.verifyTableToken(64, t)).toBe(false);
    expect(mod.verifyTableToken(61, t)).toBe(false);
  });

  it("afviser et forkert/forfalsket token", () => {
    expect(mod.verifyTableToken(63, "ikke-et-gyldigt-token-xxxxxxxx")).toBe(false);
    expect(mod.verifyTableToken(63, "")).toBe(false);
    expect(mod.verifyTableToken(63, "kort")).toBe(false);
    expect(mod.verifyTableToken(63, null)).toBe(false);
    expect(mod.verifyTableToken(63, undefined)).toBe(false);
  });

  it("afviser et token fra en anden tokenversion (rotation)", () => {
    const oldToken = mod.tableToken(63, "2025");
    expect(mod.verifyTableToken(63, oldToken, "2026")).toBe(false);
    expect(mod.verifyTableToken(63, oldToken, "2025")).toBe(true);
  });

  it("afviser ugyldige bordnumre helt", () => {
    expect(mod.verifyTableToken(99, "hvadsomhelst-langt-nok-token")).toBe(false);
    expect(() => mod.tableToken(99)).toThrow();
  });

  it("bygger en korrekt QR-URL der peger på det rigtige bord", () => {
    const url = mod.tableUrl(63, "https://bakkenshvile.dk/");
    expect(url).toMatch(/^https:\/\/bakkenshvile\.dk\/bord\/63\?k=/);
    const token = new URL(url).searchParams.get("k")!;
    expect(mod.verifyTableToken(63, token)).toBe(true);
  });
});

describe("QR-ark — 44 unikke, gyldige koder", () => {
  it("genererer præcis 44 ark", () => {
    const entries = sheet.buildQrSheet("https://bakkenshvile.dk");
    expect(entries).toHaveLength(44);
    expect(entries).toHaveLength(tables.TABLE_COUNT);
  });

  it("har unikke URLs og unikke tokens", () => {
    const entries = sheet.buildQrSheet("https://bakkenshvile.dk");
    const urls = entries.map((e) => e.url);
    const tokens = urls.map((u) => new URL(u).searchParams.get("k"));
    expect(new Set(urls).size).toBe(44);
    expect(new Set(tokens).size).toBe(44);
  });

  it("hvert ark åbner præcis det bord, der står på skiltet", () => {
    const entries = sheet.buildQrSheet("https://bakkenshvile.dk");
    for (const e of entries) {
      const u = new URL(e.url);
      // URL-stien matcher bordnummeret.
      expect(u.pathname).toBe(`/bord/${e.number}`);
      // Tokenet validerer KUN mod det bord.
      const token = u.searchParams.get("k")!;
      expect(mod.verifyTableToken(e.number, token), `bord ${e.number}`).toBe(true);
    }
  });

  it("et ark-token kan ikke bruges på nabobordet", () => {
    const entries = sheet.buildQrSheet("https://bakkenshvile.dk");
    const byNumber = new Map(entries.map((e) => [e.number, e]));
    const t63 = byNumber.get(63)!;
    const token = new URL(t63.url).searchParams.get("k")!;
    expect(mod.verifyTableToken(64, token)).toBe(false);
  });
});
