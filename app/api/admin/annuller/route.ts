// Annullér en betalt booking (personalet, fra /admin/opslag).
// Bag personalelogin og csrf-tegn. Intet refunderes, og kunden får ingen mail.
// Reglerne og rækkefølgen ligger i lib/annuller-booking.ts.

import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, TABLES } from "@/lib/airtable";
import { getDb } from "@/lib/db";
import { annullerBooking } from "@/lib/annuller-booking";
import { annullerPladser } from "@/lib/seat-holds";
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
  try {
    const body = await req.json();
    bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
  } catch {
    bookingId = "";
  }
  if (!RECORD_ID.test(bookingId)) {
    return NextResponse.json({ error: "Bookingen mangler eller er ugyldig." }, { status: 400 });
  }

  try {
    const svar = await annullerBooking(
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
        hentBetaltOre: async (id) => {
          const { rows } = await getDb().query<{ expected_total_ore: string | number }>(
            `SELECT expected_total_ore FROM ticket_payments WHERE booking_id = $1 AND status = 'paid'`,
            [id]
          );
          return rows.map((r) => Number(r.expected_total_ore));
        },
        frigivPladser: (id) => annullerPladser(getDb(), id),
        nu: () => new Date(),
        log: (besked, ctx) => console.error(besked, ctx),
      },
      bookingId
    );
    if (!svar.ok) {
      return NextResponse.json({ error: svar.error }, { status: svar.status });
    }
    return NextResponse.json(svar);
  } catch {
    console.error("Annullering fejlede uventet");
    return NextResponse.json(
      { error: "Bookingen kunne ikke annulleres lige nu. Prøv igen om lidt." },
      { status: 500 }
    );
  }
}
