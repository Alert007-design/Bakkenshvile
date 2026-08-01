import { NextRequest, NextResponse } from "next/server";
import { getRecord, TABLES, FIELDS } from "@/lib/airtable";
import { getDb } from "@/lib/db";
import {
  getLatestTicketPaymentByBooking,
  type TicketLineItem,
} from "@/lib/ticket-payments";
import { sendMail } from "@/lib/resend";
import {
  ticketEmailHtml,
  daDateShort,
  showYear,
  type EmailLineItem,
} from "@/lib/ticket-email";
import { ADDON_DISCOUNT_LABEL } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkKey(req: NextRequest): boolean {
  const key = req.nextUrl.searchParams.get("key");
  return Boolean(key && key === process.env.ADMIN_KEY);
}

// Genskaber billetlinjer ud fra bookingens "A+ x2, B x1"-tekst (fribilletter
// har ingen ledger-post med præcise linjer). Fribilletter er 0 kr, så prisen
// pr. linje er 0.
function linesFromBreakdown(breakdown: string): EmailLineItem[] {
  const out: EmailLineItem[] = [];
  for (const part of (breakdown || "").split(",")) {
    const m = part.trim().match(/^(.+?)\s+x(\d+)$/);
    if (!m) continue;
    out.push({
      description: `Billet: ${m[1].trim()}`,
      quantity: Number(m[2]),
      amountSubtotalOre: 0,
    });
  }
  return out;
}

/**
 * Gensender billet-mailen for en eksisterende booking. Beskyttet med admin-
 * nøglen. Henter de præcise linjer/beløb fra billet-ledgeren, hvis de findes
 * (Viva-betalt booking); ellers genskabes linjerne af bookingens
 * billetnedbrydning (fribillet, 0 kr).
 */
export async function POST(req: NextRequest) {
  if (!checkKey(req)) {
    return NextResponse.json({ error: "Ugyldig nøgle" }, { status: 401 });
  }

  try {
    const { bookingId } = (await req.json()) as { bookingId?: string };
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId mangler" }, { status: 400 });
    }

    const booking = await getRecord(TABLES.bookings, bookingId);
    const bookingNo = String(booking.fields[FIELDS.booking.bookingNo] ?? "");
    const ticketBreakdown = String(
      booking.fields[FIELDS.booking.ticketBreakdown] ?? ""
    );

    const customerId = (booking.fields[FIELDS.booking.customer] as
      | string[]
      | undefined)?.[0];
    const showId = (booking.fields[FIELDS.booking.show] as
      | string[]
      | undefined)?.[0];
    const [customer, show] = await Promise.all([
      customerId ? getRecord(TABLES.customers, customerId) : Promise.resolve(null),
      showId ? getRecord(TABLES.events, showId) : Promise.resolve(null),
    ]);

    const email = customer
      ? String(customer.fields[FIELDS.customer.email] ?? "").trim()
      : "";
    if (!email) {
      return NextResponse.json(
        { error: "Bookingen har ingen email at sende til." },
        { status: 400 }
      );
    }
    const customerName = customer
      ? String(customer.fields[FIELDS.customer.name] ?? "")
      : "";
    const showTitle = show ? String(show.fields[FIELDS.event.title] ?? "") : "";
    const showDateIso = show ? String(show.fields[FIELDS.event.date] ?? "") : "";
    const showTime = show ? String(show.fields[FIELDS.event.time] ?? "") : "";

    // Præcise linjer fra ledgeren, hvis bookingen er betalt via Viva; ellers
    // genskabes de af billetnedbrydningen (fribillet).
    let lineItems: EmailLineItem[];
    let subtotalKr: number;
    let discountKr: number;
    let totalKr: number;
    let ledger = null;
    try {
      ledger = await getLatestTicketPaymentByBooking(getDb(), bookingId, "billet");
    } catch (e) {
      console.error("Gensend billet: kunne ikke læse ledger", e);
    }
    if (ledger) {
      lineItems = ledger.lineItems.map((l: TicketLineItem) => ({
        description: l.description,
        quantity: l.quantity,
        amountSubtotalOre: l.amountSubtotalOre,
      }));
      discountKr = Math.round(ledger.discountOre / 100);
      totalKr = Math.round(ledger.expectedTotalOre / 100);
      subtotalKr = totalKr + discountKr;
    } else {
      lineItems = linesFromBreakdown(ticketBreakdown);
      discountKr = Number(booking.fields[FIELDS.booking.discount] ?? 0);
      totalKr = Number(booking.fields[FIELDS.booking.totalPaid] ?? 0);
      subtotalKr = totalKr + discountKr;
    }

    await sendMail({
      to: email,
      subject: showDateIso
        ? `Din billet til Bakkens Hvile ${daDateShort(showDateIso)} — ${bookingNo}`
        : `Din billet til Bakkens Hvile — ${bookingNo}`,
      html: ticketEmailHtml({
        customerName,
        bookingNo,
        showTitle,
        showDateIso,
        showTime,
        seats: ticketBreakdown,
        isJubilee: showYear(showDateIso) === 2027,
        lineItems,
        subtotalKr,
        discountKr,
        totalKr,
        discountLabel: ADDON_DISCOUNT_LABEL,
      }),
    });

    return NextResponse.json({ ok: true, sentTo: email });
  } catch (err) {
    console.error("Gensend billet fejlede", err);
    return NextResponse.json(
      { error: "Kunne ikke gensende billetten. Prøv igen." },
      { status: 500 }
    );
  }
}
