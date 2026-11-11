// Ret en kundes email (fra /admin/opslag). Bag personalelogin og csrf-tegn.
// Der sendes ingen mail herfra. Reglerne ligger i lib/kunde-email.ts.

import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, TABLES } from "@/lib/airtable";
import { retKundeEmail } from "@/lib/kunde-email";
import { verifyStaffSession, verifyCsrf, STAFF_COOKIE_NAME } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

async function hent(tabel: string, id: string) {
  try {
    return await getRecord(tabel, id);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const s = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!s) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  if (!verifyCsrf(s, req.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 403 });
  }

  let bookingId = "";
  let email: unknown = "";
  let bekraeftet = false;
  try {
    const body = await req.json();
    bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
    email = body?.email;
    bekraeftet = body?.bekraeftet === true;
  } catch {
    bookingId = "";
  }
  if (!RECORD_ID.test(bookingId)) {
    return NextResponse.json({ error: "Bookingen mangler eller er ugyldig." }, { status: 400 });
  }

  try {
    const svar = await retKundeEmail(
      {
        hentBooking: (id) => hent(TABLES.bookings, id),
        hentKunde: (id) => hent(TABLES.customers, id),
        opdaterKunde: async (id, felter) => {
          await updateRecord(TABLES.customers, id, felter);
        },
        log: (besked, ctx) => console.error(besked, ctx),
      },
      bookingId,
      email,
      bekraeftet
    );
    if (!svar.ok) {
      return NextResponse.json({ error: svar.error, forslag: svar.forslag }, { status: svar.status });
    }
    return NextResponse.json(svar);
  } catch {
    console.error("Ret email fejlede uventet");
    return NextResponse.json({ error: "Emailen blev ikke rettet. Prøv igen om lidt." }, { status: 500 });
  }
}
