import { NextRequest, NextResponse } from "next/server";
import { checkBarPassword, createBarSession, BAR_COOKIE_NAME } from "@/lib/bar-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Rate limiting på login (brute-force-værn).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "ukendt";
  const rl = rateLimit(`bar-login:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "For mange forsøg. Vent lidt." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  }

  if (!checkBarPassword((body as { password?: unknown }).password)) {
    return NextResponse.json({ error: "Forkert kode." }, { status: 401 });
  }

  const session = createBarSession();
  const res = NextResponse.json({ ok: true, csrf: session.csrf });
  res.cookies.set(BAR_COOKIE_NAME, session.value, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: session.maxAgeSec,
  });
  return res;
}
