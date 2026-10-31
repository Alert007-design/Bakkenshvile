import { NextRequest, NextResponse } from "next/server";
import {
  createRecord,
  cachedListRecords,
  TABLES,
  FIELDS,
  priceGroupName,
} from "@/lib/airtable";
import { getShowDate } from "@/lib/events";
import type { TicketTypeDef } from "@/lib/ticket-checkout";
import { sendMail } from "@/lib/resend";
import { verifyStaffSession, verifyCsrf, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import { getDb } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { vivaSourceCode } from "@/lib/payments/viva-client";
import { kategoriFraAirtable } from "@/lib/kapacitet";
import { opretEkstrabillet, type EkstraInput } from "@/lib/ekstrabillet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opretter EKSTRA BETALTE billetter fra admin: en booking, der afventer
 * betaling, et betalingslink fra Viva (gyldigt i 24 timer) og en mail til
 * gæsten. Selve forløbet ligger i lib/ekstrabillet.ts.
 */
export async function POST(req: NextRequest) {
  const s = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!s) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  if (!verifyCsrf(s, req.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 403 });
  }

  try {
    const body = ((await req.json()) ?? {}) as EkstraInput;
    // Fejler lukket, hvis livebetaling af billetter ikke er slået til.
    const provider = getPaymentProvider("tickets");
    const svar = await opretEkstrabillet(
      {
        db: getDb(),
        hentShow: getShowDate,
        hentBilletTyper: async () => {
          const records = await cachedListRecords(TABLES.ticketTypes, 60_000);
          return records.map(
            (r): TicketTypeDef => ({
              id: r.id,
              category: String(r.fields[FIELDS.ticketType.category] ?? ""),
              price: Number(r.fields[FIELDS.ticketType.price] ?? 0),
              fee: Number(r.fields[FIELDS.ticketType.fee] ?? 0),
              maxCount: Number(r.fields[FIELDS.ticketType.maxCount] ?? 0),
              priceGroup: priceGroupName(r.fields[FIELDS.ticketType.priceGroup]),
              kapacitetskategori: kategoriFraAirtable(
                r.fields[FIELDS.ticketType.kapacitetskategori]
              ),
            })
          );
        },
        opretKunde: (fields) => createRecord(TABLES.customers, fields),
        opretBooking: (fields) => createRecord(TABLES.bookings, fields),
        opretBetaling: (input) => provider.createPayment(input),
        sendMail: async (m) => {
          await sendMail(m);
        },
        sourceCode: vivaSourceCode("tickets"),
        origin: req.nextUrl.origin,
      },
      body
    );
    if (!svar.ok) {
      const { ok: _ok, status, ...rest } = svar;
      return NextResponse.json(rest, { status });
    }
    return NextResponse.json(svar);
  } catch (err) {
    console.error("Ekstrabillet kunne ikke oprettes");
    return NextResponse.json(
      { error: "Ekstrabilletten kunne ikke oprettes. Prøv igen." },
      { status: 500 }
    );
  }
}
