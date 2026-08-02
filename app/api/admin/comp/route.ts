import { NextRequest, NextResponse } from "next/server";
import {
  createRecord,
  cachedListRecords,
  TABLES,
  FIELDS,
  priceGroupName,
} from "@/lib/airtable";
import { getShowDate, type ShowDate } from "@/lib/events";
import {
  validateTicketCheckout,
  type TicketTypeDef,
} from "@/lib/ticket-checkout";
import { generateBookingKey } from "@/lib/genbestil";
import { sendMail } from "@/lib/resend";
import { ticketEmailHtml, daDateShort, showYear } from "@/lib/ticket-email";
import { ADDON_DISCOUNT_LABEL } from "@/lib/pricing";
import { verifyStaffSession, verifyCsrf, STAFF_COOKIE_NAME } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKDAYS_SHORT = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MONTHS = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

// Vis-label til billetlinjens navn ("Billet: <kategori> — <showlabel>"), i UTC
// så en UTC-server ikke forskyder datoen. Samme format som billetkøbet.
function showLabelFor(show: ShowDate): string {
  const d = new Date(`${show.date}T00:00:00Z`);
  const datePart = isNaN(d.getTime())
    ? show.date
    : `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
  return show.time ? `${datePart} kl. ${show.time}` : datePart;
}

/**
 * Opretter en FRIBILLET: en booking uden betaling. Total er 0 kr, så Viva
 * springes helt over — bookingen markeres straks "Betalt", og billet-mailen
 * sendes som ved et normalt køb. Beskyttet med admin-nøglen, så gæster aldrig
 * kan give sig selv gratis billetter. Tilvalg understøttes ikke (kun billetter).
 */
export async function POST(req: NextRequest) {
  // Fribilletter oprettes KUN af personalet via den fælles login-session.
  const s = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!s) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  if (!verifyCsrf(s, req.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      showId,
      tickets,
      customer,
      note,
    }: {
      showId?: string;
      tickets?: { ticketTypeId: string; quantity: number }[];
      customer?: { name?: string; email?: string; phone?: string };
      note?: string;
    } = body ?? {};

    if (!customer?.name) {
      return NextResponse.json(
        { error: "Gæstens navn er påkrævet." },
        { status: 400 }
      );
    }

    // Forestillingen og billettyperne slås op serverside. Fribilletter kan gives
    // til udsolgte shows (æresgæst), men ikke til afholdte datoer.
    const show = showId ? await getShowDate(showId) : null;
    const ticketTypeRecords = await cachedListRecords(TABLES.ticketTypes, 60_000);
    const ticketTypes: TicketTypeDef[] = ticketTypeRecords.map((r) => ({
      id: r.id,
      category: String(r.fields[FIELDS.ticketType.category] ?? ""),
      price: Number(r.fields[FIELDS.ticketType.price] ?? 0),
      fee: Number(r.fields[FIELDS.ticketType.fee] ?? 0),
      maxCount: Number(r.fields[FIELDS.ticketType.maxCount] ?? 0),
      priceGroup: priceGroupName(r.fields[FIELDS.ticketType.priceGroup]),
    }));

    // Genbrug den fælles validering (kendt/kommende show, billettyper i rette
    // prisgruppe, gyldige antal, mindst én billet) — blot med udsolgt tilladt.
    const result = validateTicketCheckout(
      { tickets: tickets ?? [], addons: [] },
      {
        show,
        ticketTypes,
        addons: [],
        discountActive: false,
        showLabel: show ? showLabelFor(show) : "",
        allowSoldOut: true,
      }
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const customerRecord = await createRecord(TABLES.customers, {
      [FIELDS.customer.name]: customer.name,
      [FIELDS.customer.email]: customer.email || "",
      [FIELDS.customer.phone]: customer.phone || "",
    });
    const bookingNo = `BH-FRI-${Date.now().toString().slice(-6)}`;

    const bookingFields: Record<string, unknown> = {
      [FIELDS.booking.bookingNo]: bookingNo,
      [FIELDS.booking.ticketCount]: result.totals.ticketCount,
      [FIELDS.booking.specialRequests]: note ? `Fribillet — ${note}` : "Fribillet",
      [FIELDS.booking.status]: "Betalt",
      [FIELDS.booking.discount]: 0,
      [FIELDS.booking.customer]: [customerRecord.id],
      [FIELDS.booking.ticketBreakdown]: result.ticketBreakdown,
      [FIELDS.booking.totalPaid]: 0,
      // Ugættelig nøgle, så gæsten stadig kan genbestille tilvalg via /genbestil.
      [FIELDS.booking.key]: generateBookingKey(),
      [FIELDS.booking.show]: [showId],
    };
    await createRecord(TABLES.bookings, bookingFields);

    // Send billet-mailen, hvis der er en email (best-effort — bookingen er
    // oprettet uanset, og sendMail kaster ikke ved fejl).
    let emailed = false;
    if (customer.email && show) {
      const lineItems = result.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        amountSubtotalOre: 0, // fribillet: 0 kr pr. linje
      }));
      await sendMail({
        to: customer.email,
        subject: show.date
          ? `Din fribillet til Bakkens Hvile ${daDateShort(show.date)} — ${bookingNo}`
          : `Din fribillet til Bakkens Hvile — ${bookingNo}`,
        html: ticketEmailHtml({
          customerName: customer.name,
          bookingNo,
          showTitle: show.title,
          showDateIso: show.date,
          showTime: show.time,
          seats: result.ticketBreakdown,
          isJubilee: showYear(show.date) === 2027,
          lineItems,
          subtotalKr: 0,
          discountKr: 0,
          totalKr: 0,
          discountLabel: ADDON_DISCOUNT_LABEL,
        }),
      });
      emailed = true;
    }

    return NextResponse.json({
      ok: true,
      bookingNo,
      ticketBreakdown: result.ticketBreakdown,
      emailed,
    });
  } catch (err) {
    console.error("Fribillet kunne ikke oprettes", err);
    return NextResponse.json(
      { error: "Fribillet kunne ikke oprettes. Prøv igen." },
      { status: 500 }
    );
  }
}
