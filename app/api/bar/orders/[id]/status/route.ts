import { NextRequest, NextResponse } from "next/server";
import { verifyBarSession, verifyCsrf, BAR_COOKIE_NAME } from "@/lib/bar-auth";
import { getDb } from "@/lib/db";
import { setFulfillmentStatus } from "@/lib/orders";
import type { FulfillmentStatus } from "@/lib/order-status";

export const runtime = "nodejs";

const ALLOWED: FulfillmentStatus[] = [
  "new",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = verifyBarSession(req.cookies.get(BAR_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  // CSRF-beskyttelse ved statusændring.
  if (!verifyCsrf(session, req.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  }
  const to = (body as { toStatus?: unknown }).toStatus;
  if (typeof to !== "string" || !ALLOWED.includes(to as FulfillmentStatus)) {
    return NextResponse.json({ error: "Ukendt status." }, { status: 400 });
  }

  try {
    const next = await setFulfillmentStatus(getDb(), params.id, to as FulfillmentStatus);
    return NextResponse.json({ ok: true, status: next });
  } catch {
    // Ugyldig overgang eller ubetalt ordre.
    return NextResponse.json(
      { error: "Statusændringen kunne ikke gennemføres." },
      { status: 409 }
    );
  }
}
