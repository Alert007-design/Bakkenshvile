import { NextRequest, NextResponse } from "next/server";
import { STAFF_COOKIE_NAME, CLEARED_STAFF_COOKIE } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Udlogning: nulstil session-cookien.
//  - POST (fetch fra en knap) → JSON, så klienten selv kan navigere.
//  - GET (almindeligt link) → ryd cookien og send brugeren til login-siden.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_COOKIE_NAME, "", CLEARED_STAFF_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const res = NextResponse.redirect(url);
  res.cookies.set(STAFF_COOKIE_NAME, "", CLEARED_STAFF_COOKIE);
  return res;
}
