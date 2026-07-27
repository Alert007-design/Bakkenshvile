import { NextRequest, NextResponse } from "next/server";
import { verifyBarSession, verifyCsrf, BAR_COOKIE_NAME } from "@/lib/bar-auth";
import { getDb } from "@/lib/db";
import {
  getActiveEvent,
  activateEvent,
  setHallState,
  type HallStateValue,
} from "@/lib/hall-state";
import { cachedListRecords, TABLES, FIELDS } from "@/lib/airtable";

export const runtime = "nodejs";

const STATES: HallStateValue[] = ["before_show", "show", "interval", "closed"];

// Kommende forestillinger, så baren kan bekræfte aftenens event.
async function upcomingEvents() {
  const records = await cachedListRecords(TABLES.events, 60_000);
  return records
    .map((r) => ({
      id: r.id,
      title: String(r.fields[FIELDS.event.title] ?? ""),
      date: String(r.fields[FIELDS.event.date] ?? ""),
      time: String(r.fields[FIELDS.event.time] ?? ""),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(req: NextRequest) {
  const session = verifyBarSession(req.cookies.get(BAR_COOKIE_NAME)?.value);
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
  const session = verifyBarSession(req.cookies.get(BAR_COOKIE_NAME)?.value);
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
