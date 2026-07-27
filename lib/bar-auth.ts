// Adgang til barens skærm (/bar). Adgangskoden kontrolleres KUN serverside; ved
// korrekt login udstedes en signeret session-cookie (HMAC med BAR_SESSION_SECRET)
// uden selve koden. Cookien sættes HttpOnly, Secure, SameSite=Strict af ruten.
//
// CSRF: sessionen indeholder et tilfældigt csrf-token. Det gives til klienten
// (serverkomponenten læser det fra den HttpOnly-cookie og sender det som prop),
// og statusændringer skal sende det med i en header, som serveren tjekker mod
// sessionens token — dobbelt-submit-værn oven på SameSite=Strict.

import { createHmac, timingSafeEqual, randomBytes } from "crypto";

export const BAR_COOKIE_NAME = "bar_session";
const TTL_MS = 8 * 60 * 60 * 1000; // 8 timers barsession

function secret(): string {
  const s = process.env.BAR_SESSION_SECRET;
  if (!s) throw new Error("BAR_SESSION_SECRET mangler i miljøvariablerne");
  return s;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export interface BarSession {
  exp: number;
  csrf: string;
}

export interface NewBarSession {
  value: string;
  csrf: string;
  maxAgeSec: number;
}

/** Opretter en ny, signeret barsession (uden adgangskoden). */
export function createBarSession(now: number = Date.now()): NewBarSession {
  const csrf = randomBytes(18).toString("base64url");
  const exp = now + TTL_MS;
  const payload = Buffer.from(JSON.stringify({ exp, csrf })).toString("base64url");
  return {
    value: `${payload}.${sign(payload)}`,
    csrf,
    maxAgeSec: Math.floor(TTL_MS / 1000),
  };
}

/** Verificerer en session-cookie. Null hvis ugyldig, forfalsket eller udløbet. */
export function verifyBarSession(
  value: string | undefined,
  now: number = Date.now()
): BarSession | null {
  if (!value) return null;
  const idx = value.lastIndexOf(".");
  if (idx <= 0) return null;
  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  if (!safeEqual(sig, sign(payload))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const p = parsed as { exp?: unknown; csrf?: unknown };
  if (typeof p.exp !== "number" || p.exp < now) return null;
  if (typeof p.csrf !== "string" || !p.csrf) return null;
  return { exp: p.exp, csrf: p.csrf };
}

/** Timing-safe kontrol af barens adgangskode. */
export function checkBarPassword(pw: unknown): boolean {
  const expected = process.env.BAR_SCREEN_PASSWORD;
  if (!expected || typeof pw !== "string") return false;
  return safeEqual(pw, expected);
}

/** CSRF-tjek: headerens token skal matche sessionens. */
export function verifyCsrf(session: BarSession | null, headerToken: string | null): boolean {
  if (!session || !headerToken) return false;
  return safeEqual(headerToken, session.csrf);
}
