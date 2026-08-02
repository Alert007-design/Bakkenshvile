// Fælles adgangsværn for alle interne personalesider og deres API-ruter.
// Kører på Edge, så verifikationen sker med Web Crypto (samme token-format som
// lib/staff-auth.ts, der signerer serverside i login-ruten).
//
// Værnet er ét centralt chokepunkt: uden en gyldig, uudløbet session omdirigeres
// sidekald til /login, og API-kald besvares med 401. De enkelte ruter verificerer
// DESUDEN sessionen serverside (defense-in-depth) og håndhæver CSRF på mutationer.

import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "bh_staff";

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verificerer session-cookien (HMAC + udløb). Samme format som staff-auth.ts. */
async function isValidSession(value: string | undefined): Promise<boolean> {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!value || !secret) return false;
  const idx = value.lastIndexOf(".");
  if (idx <= 0) return false;
  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const expected = bytesToBase64url(new Uint8Array(mac));
    if (!timingSafeEqual(expected, sig)) return false;

    const json = new TextDecoder().decode(base64urlToBytes(payload));
    const parsed = JSON.parse(json) as { exp?: unknown; csrf?: unknown };
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return false;
    if (typeof parsed.csrf !== "string" || !parsed.csrf) return false;
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const valid = await isValidSession(req.cookies.get(COOKIE_NAME)?.value);
  if (!valid) {
    if (isApi) {
      return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  // Gyldig session — luk igennem, men markér som ikke-indekserbar.
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: [
    "/bar/:path*",
    "/admin/:path*",
    "/funktioner/:path*",
    "/api/admin/:path*",
    "/api/bar/:path*",
  ],
};
