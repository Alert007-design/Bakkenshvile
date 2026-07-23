import { NextRequest, NextResponse } from "next/server";
import { listRecords, updateRecord, TABLES, FIELDS } from "@/lib/airtable";

function checkKey(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  return key && key === process.env.ADMIN_KEY;
}

export async function GET(req: NextRequest) {
  if (!checkKey(req)) {
    return NextResponse.json({ error: "Ugyldig nøgle" }, { status: 401 });
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
  if (!checkKey(req)) {
    return NextResponse.json({ error: "Ugyldig nøgle" }, { status: 401 });
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
