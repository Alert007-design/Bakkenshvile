import { NextRequest, NextResponse } from "next/server";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import { getDb } from "@/lib/db";
import { getActiveEvent } from "@/lib/hall-state";
import { listActiveOrders } from "@/lib/orders";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }

  const db = getDb();
  const active = await getActiveEvent(db);
  const orders = active ? await listActiveOrders(db, active.eventId) : [];

  return NextResponse.json(
    {
      activeEvent: active,
      orders,
      serverTime: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
