import { NextRequest, NextResponse } from "next/server";
import {
  checkStaffPassword,
  createStaffSession,
  STAFF_COOKIE_NAME,
  staffCookieOptions,
} from "@/lib/staff-auth";
import { loginThrottle } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fælles login for alle interne personalesider. Adgangskoden valideres
// serverside (timing-safe), og der udstedes en signeret HttpOnly-session.
export async function POST(req: NextRequest) {
  // Ratebegrænsning + midlertidig spærring (brute-force-værn).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "ukendt";
  const throttle = loginThrottle(ip);
  if (!throttle.ok) {
    return NextResponse.json(
      { error: "For mange forsøg. Prøv igen om lidt." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  }

  // Neutral fejlbesked ved forkert login — afslører hverken kodens navn,
  // værdi eller placering.
  if (!checkStaffPassword((body as { password?: unknown }).password)) {
    return NextResponse.json({ error: "Forkert adgangskode." }, { status: 401 });
  }

  const session = createStaffSession();
  const res = NextResponse.json({ ok: true, csrf: session.csrf });
  res.cookies.set(
    STAFF_COOKIE_NAME,
    session.value,
    staffCookieOptions(session.maxAgeSec)
  );
  return res;
}
