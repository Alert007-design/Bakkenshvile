// Admin-API for gavekort: liste (GET) og markér-som-brugt (POST). Beskyttet af
// den fælles personalesession (også håndhævet i middleware.ts). Muterende kald
// kræver desuden et gyldigt CSRF-token i x-csrf-token-headeren.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listGiftCards, markGiftCardUsed } from "@/lib/gift-cards";
import { verifyStaffSession, verifyCsrf, STAFF_COOKIE_NAME } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionFrom(req: NextRequest) {
  return verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
}

export async function GET(req: NextRequest) {
  if (!sessionFrom(req)) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  const cards = await listGiftCards(getDb());
  return NextResponse.json({ cards });
}

export async function POST(req: NextRequest) {
  const session = sessionFrom(req);
  if (!session) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  if (!verifyCsrf(session, req.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "Angiv en gavekortkode." }, { status: 400 });
  }

  const result = await markGiftCardUsed(getDb(), code, "personale");
  if (result.status === "not_found") {
    return NextResponse.json({ error: "Der findes intet gavekort med den kode." }, { status: 404 });
  }
  if (result.status === "not_payable") {
    return NextResponse.json(
      { error: `Kan ikke markeres brugt — status er "${result.card.status}".`, card: result.card },
      { status: 409 }
    );
  }
  return NextResponse.json({ card: result.card });
}
