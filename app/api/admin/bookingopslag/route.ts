// Opslag på et bookingnummer: bookingen, kunden, forestillingen og kundens
// øvrige bookinger. Kun læsning. Bag personalelogin (middleware.ts og
// verifyStaffSession herunder).

import { NextRequest, NextResponse } from "next/server";
import { findRecords, getRecord, TABLES, FIELDS, type AirtableRecord } from "@/lib/airtable";
import { getShowDate } from "@/lib/events";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import { bygOpslag, gyldigtOpslagsnummer } from "@/lib/bookingopslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

function foersteId(v: unknown): string | null {
  const id = Array.isArray(v) ? v[0] : null;
  return typeof id === "string" && RECORD_ID.test(id) ? id : null;
}

export async function GET(req: NextRequest) {
  if (!verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  const nr = gyldigtOpslagsnummer(req.nextUrl.searchParams.get("nr"));
  if (!nr) {
    return NextResponse.json(
      { error: "Skriv et bookingnummer, fx BH-K7M2Q9XR eller BH260717268." },
      { status: 400 }
    );
  }

  try {
    const fundne = await findRecords(TABLES.bookings, `{Bookingnr}="${nr}"`);
    const booking = fundne[0];
    if (!booking) {
      return NextResponse.json({ error: `Der findes ingen booking med nummeret ${nr}.` }, { status: 404 });
    }

    const kundeId = foersteId(booking.fields[FIELDS.booking.customer]);
    const showId = foersteId(booking.fields[FIELDS.booking.show]);
    const [kunde, show] = await Promise.all([
      kundeId ? getRecord(TABLES.customers, kundeId) : Promise.resolve(null),
      showId ? getShowDate(showId) : Promise.resolve(null),
    ]);
    const opslag = bygOpslag(
      booking,
      kunde,
      show ? { title: show.title, date: show.date, time: show.time } : null
    );

    // Kundens øvrige bookinger (højst 20), så man kan se hele kundeforholdet.
    const andreIds = ((kunde?.fields[FIELDS.customer.bookings] as unknown[]) ?? [])
      .filter((id): id is string => typeof id === "string" && RECORD_ID.test(id) && id !== booking.id)
      .slice(0, 20);
    let andre: { bookingNo: string; antal: number; status: string; dato: string; tid: string }[] = [];
    if (andreIds.length > 0) {
      const poster: AirtableRecord[] = await findRecords(
        TABLES.bookings,
        `OR(${andreIds.map((id) => `RECORD_ID()="${id}"`).join(",")})`
      );
      andre = await Promise.all(
        poster.map(async (p) => {
          const s = foersteId(p.fields[FIELDS.booking.show]);
          const sd = s ? await getShowDate(s) : null;
          const status = p.fields[FIELDS.booking.status];
          return {
            bookingNo: String(p.fields[FIELDS.booking.bookingNo] ?? ""),
            antal: Number(p.fields[FIELDS.booking.ticketCount] ?? 0),
            status: typeof status === "string" ? status : "",
            dato: sd?.date ?? "",
            tid: sd?.time ?? "",
          };
        })
      );
      andre.sort((a, b) => (a.dato < b.dato ? -1 : a.dato > b.dato ? 1 : 0));
    }

    return NextResponse.json({ opslag, andre });
  } catch (err) {
    console.error("Bookingopslag fejlede");
    return NextResponse.json(
      { error: "Opslaget kunne ikke gennemføres lige nu. Prøv igen om lidt." },
      { status: 502 }
    );
  }
}
