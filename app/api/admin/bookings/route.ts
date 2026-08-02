import { NextRequest, NextResponse } from "next/server";
import { listRecords, updateRecord, TABLES, FIELDS } from "@/lib/airtable";
import { verifyStaffSession, verifyCsrf, STAFF_COOKIE_NAME } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Felt-id for "Billetkategorier" i Bookings-tabellen (oprettet direkte i
// Airtable). Overvej at tilføje "ticketBreakdown: 'fldXuocW3IneLzwnY'" til
// FIELDS.booking i lib/airtable.ts, og skift referencen herunder til
// FIELDS.booking.ticketBreakdown for konsistens med resten af koden.
const TICKET_BREAKDOWN_FIELD = "fldXuocW3IneLzwnY";

// Adgang via den fælles personalesession (middleware håndhæver den også).
function session(req: NextRequest) {
  return verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
}
export async function GET(req: NextRequest) {
  if (!session(req)) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  const showId = req.nextUrl.searchParams.get("showId");
  if (!showId) {
    return NextResponse.json({ error: "showId mangler" }, { status: 400 });
  }
  const [bookings, customers] = await Promise.all([
    listRecords(TABLES.bookings),
    listRecords(TABLES.customers),
  ]);
  const customerMap = new Map(customers.map((c) => [c.id, c.fields]));
  const rows = bookings
    .filter((b) => {
      const shows = b.fields[FIELDS.booking.show] as string[] | undefined;
      return Array.isArray(shows) && shows.includes(showId);
    })
    .map((b) => {
      const customerIds = (b.fields[FIELDS.booking.customer] as string[]) || [];
      const customerFields = customerMap.get(customerIds[0]) || {};
      return {
        id: b.id,
        bookingNo: String(b.fields[FIELDS.booking.bookingNo] ?? ""),
        ticketCount: Number(b.fields[FIELDS.booking.ticketCount] ?? 0),
        ticketBreakdown: String(b.fields[TICKET_BREAKDOWN_FIELD] ?? ""),
        status: String(b.fields[FIELDS.booking.status] ?? ""),
        tableNumber: String(b.fields[FIELDS.booking.tableNumber] ?? ""),
        wantsMatching: Boolean(b.fields[FIELDS.booking.wantsMatching]),
        ageGroup: String(b.fields[FIELDS.booking.ageGroup] ?? ""),
        location: String(b.fields[FIELDS.booking.location] ?? ""),
        interests: String(b.fields[FIELDS.booking.interests] ?? ""),
        drinkPreference: String(b.fields[FIELDS.booking.drinkPreference] ?? ""),
        note: String(b.fields[FIELDS.booking.matchNote] ?? ""),
        customerName: String(customerFields[FIELDS.customer.name] ?? ""),
        customerPhone: String(customerFields[FIELDS.customer.phone] ?? ""),
      };
    });
  return NextResponse.json({ rows });
}
export async function PATCH(req: NextRequest) {
  const s = session(req);
  if (!s) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  if (!verifyCsrf(s, req.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 403 });
  }
  const body = await req.json();
  const { bookingId, tableNumber } = body as {
    bookingId: string;
    tableNumber: string;
  };
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId mangler" }, { status: 400 });
  }
  await updateRecord(TABLES.bookings, bookingId, {
    [FIELDS.booking.tableNumber]: tableNumber || "",
  });
  return NextResponse.json({ ok: true });
}
