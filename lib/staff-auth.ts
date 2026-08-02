// Fælles adgang til ALLE interne personalesider (/bar, /admin, /admin/qr,
// /admin/fribillet, /funktioner) og de tilhørende interne API-ruter.
//
// Én adgangskode (STAFF_PASSWORD) kontrolleres KUN serverside. Ved korrekt
// login udstedes en kortvarig, signeret session-cookie (HMAC med
// STAFF_SESSION_SECRET) uden selve koden. Cookien sættes HttpOnly, Secure,
// SameSite=Strict af login-ruten.
//
// CSRF: sessionen indeholder et tilfældigt csrf-token. Serverkomponenten læser
// det fra den HttpOnly-cookie og sender det som prop til klienten, og enhver
// muterende forespørgsel skal sende det med i en header, som serveren tjekker
// mod sessionens token — dobbelt-submit-værn oven på SameSite=Strict.
//
// Adgangskodens navn, værdi og placering afsløres aldrig i nogen fejlbesked
// eller adgangsside.

import { createHmac, timingSafeEqual, randomBytes } from "crypto";

export const STAFF_COOKIE_NAME = "bh_staff";

// Kortvarig session. 8 timer dækker en hel arbejdsaften i baren uden at kræve
// gentagne logins, men udløber så adgangen ikke ligger åben i dagevis.
const TTL_MS = 8 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.STAFF_SESSION_SECRET;
  if (!s) throw new Error("STAFF_SESSION_SECRET mangler i miljøvariablerne");
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

export interface StaffSession {
  exp: number;
  csrf: string;
}

export interface NewStaffSession {
  value: string;
  csrf: string;
  maxAgeSec: number;
}

/** Opretter en ny, signeret personalesession (uden adgangskoden). */
export function createStaffSession(now: number = Date.now()): NewStaffSession {
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
export function verifyStaffSession(
  value: string | undefined,
  now: number = Date.now()
): StaffSession | null {
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

/** Timing-safe kontrol af den fælles personaleadgangskode. */
export function checkStaffPassword(pw: unknown): boolean {
  const expected = process.env.STAFF_PASSWORD;
  if (!expected || typeof pw !== "string") return false;
  return safeEqual(pw, expected);
}

/** CSRF-tjek: headerens token skal matche sessionens. */
export function verifyCsrf(
  session: StaffSession | null,
  headerToken: string | null
): boolean {
  if (!session || !headerToken) return false;
  return safeEqual(headerToken, session.csrf);
}

/**
 * Cookie-options til udlogning: sæt cookien til tom med maxAge 0, så browseren
 * straks fjerner sessionen.
 */
export const CLEARED_STAFF_COOKIE = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: 0,
};

/** Cookie-options ved login (fælles for login-ruten). */
export function staffCookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}
