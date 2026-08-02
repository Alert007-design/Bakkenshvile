import { NextRequest, NextResponse } from "next/server";
import { verifyStaffSession, verifyCsrf, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import { getDb } from "@/lib/db";
import {
  getActiveEvent,
  activateEvent,
  setHallState,
  type HallStateValue,
} from "@/lib/hall-state";
import { listShowDates } from "@/lib/events";

export const runtime = "nodejs";

const STATES: HallStateValue[] = ["before_show", "show", "interval", "closed"];

// Kun kommende forestillinger, så baren kan bekræfte aftenens event uden at
// afholdte datoer roder listen til. Datoerne kommer fra den fælles kilde.
async function upcomingEvents() {
  const shows = await listShowDates();
  return shows.map((s) => ({
    id: s.id,
    title: s.title,
    date: s.date,
    time: s.time,
  }));
}

export async function GET(req: NextRequest) {
  const session = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Log ind igen." }, { status: 401 });

  const active = await getActiveEvent(getDb());
  let events: Awaited<ReturnType<typeof upcomingEvents>> = [];
  try {
    events = await upcomingEvents();
  } catch {
    events = [];
  }
  return NextResponse.json(
    { activeEvent: active, events },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const session = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  if (!verifyCsrf(session, req.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  }
  const b = body as { action?: unknown; eventId?: unknown; state?: unknown };

  const eventId = typeof b.eventId === "string" ? b.eventId : "";
  const state = b.state;
  if (!eventId) return NextResponse.json({ error: "Vælg en forestilling." }, { status: 400 });
  if (typeof state !== "string" || !STATES.includes(state as HallStateValue)) {
    return NextResponse.json({ error: "Ukendt tilstand." }, { status: 400 });
  }

  const db = getDb();
  if (b.action === "activate") {
    // Bekræft aftenens forestilling: åbner denne, lukker alle andre.
    const hs = await activateEvent(db, eventId, state as HallStateValue);
    return NextResponse.json({ ok: true, hallState: hs });
  }

  // Skift tilstand for det aktive event. "closed" lukker bestilling.
  const orderingOpen = state !== "closed";
  const hs = await setHallState(db, eventId, state as HallStateValue, orderingOpen);
  return NextResponse.json({ ok: true, hallState: hs });
}
