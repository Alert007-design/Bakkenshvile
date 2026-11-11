// Gem en note fra personalet på en booking (fra /admin/opslag).
// Bag personalelogin og csrf-tegn. Kunden får ingen besked.
// Reglerne ligger i lib/booking-note.ts.

import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, TABLES } from "@/lib/airtable";
import { tilfoejPersonalenote } from "@/lib/booking-note";
import { verifyStaffSession, verifyCsrf, STAFF_COOKIE_NAME } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

export async function POST(req: NextRequest) {
  const s = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!s) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  if (!verifyCsrf(s, req.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 403 });
  }

  let bookingId = "";
  let note: unknown = "";
  try {
    const body = await req.json();
    bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
    note = body?.note;
  } catch {
    bookingId = "";
  }
  if (!RECORD_ID.test(bookingId)) {
    return NextResponse.json({ error: "Bookingen mangler eller er ugyldig." }, { status: 400 });
  }

  try {
    const svar = await tilfoejPersonalenote(
      {
        hentBooking: async (id) => {
          try {
            return await getRecord(TABLES.bookings, id);
          } catch {
            return null;
          }
        },
        opdaterBooking: async (id, felter) => {
          await updateRecord(TABLES.bookings, id, felter);
        },
        nu: () => new Date(),
        log: (besked, ctx) => console.error(besked, ctx),
      },
      bookingId,
      note
    );
    if (!svar.ok) {
      return NextResponse.json({ error: svar.error }, { status: svar.status });
    }
    return NextResponse.json(svar);
  } catch {
    console.error("Note fejlede uventet");
    return NextResponse.json(
      { error: "Noten blev ikke gemt. Prøv igen om lidt." },
      { status: 500 }
    );
  }
}
