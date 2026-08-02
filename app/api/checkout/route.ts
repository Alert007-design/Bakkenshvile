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
  type AddonDef,
} from "@/lib/ticket-checkout";
import { getDb } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { vivaSourceCode } from "@/lib/payments/viva-client";
import { createTicketPayment, type TicketLineItem } from "@/lib/ticket-payments";
import { generateBookingKey, onlineDiscountActive } from "@/lib/genbestil";

// Betalingen udløber efter 30 min. (samme vindue som bordbestillingen).
const CHECKOUT_EXPIRY_MINUTES = 30;

const WEEKDAYS_SHORT = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MONTHS = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];

// Vis-label til billetlinjens navn ("Billet: <kategori> — <showlabel>").
// Bygges serverside (i UTC, så en UTC-server ikke forskyder datoen), da
// browseren ikke længere sender linjenavne.
function showLabelFor(show: ShowDate): string {
  const d = new Date(`${show.date}T00:00:00Z`);
  const datePart = isNaN(d.getTime())
    ? show.date
    : `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
  return show.time ? `${datePart} kl. ${show.time}` : datePart;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      customer,
      specialRequests,
      showId,
      matching,
      acceptTerms,
    }: {
      customer: {
        name: string;
        company?: string;
        phone?: string;
        email?: string;
      };
      specialRequests?: string;
      showId?: string;
      matching?: {
        wantsMatching?: boolean;
        ageGroup?: string;
        location?: string;
        interests?: string;
        drinkPreference?: string;
        note?: string;
      };
      acceptTerms?: boolean;
    } = body;
    if (!customer?.name || (!customer?.phone && !customer?.email)) {
      return NextResponse.json(
        { error: "Navn samt telefon eller email er påkrævet" },
        { status: 400 }
      );
    }
    // Obligatorisk accept af handelsbetingelser + privatlivspolitik. Håndhæves
    // også serverside, så købet aldrig kan gennemføres uden accept — heller
    // ikke hvis klienten omgås.
    if (acceptTerms !== true) {
      return NextResponse.json(
        {
          error:
            "Du skal acceptere handelsbetingelserne og have læst privatlivspolitikken.",
        },
        { status: 400 }
      );
    }

    // Forestillingen, billettyperne og tilvalgene slås op serverside — aldrig
    // klientens tal. Datoen (og dermed rabatgrænsen) og prisgruppen kommer
    // fra Airtable, så priser og prisgruppe ikke kan manipuleres i browseren.
    const show = showId ? await getShowDate(showId) : null;
    const [ticketTypeRecords, addonRecords] = await Promise.all([
      cachedListRecords(TABLES.ticketTypes, 60_000),
      cachedListRecords(TABLES.addOns, 60_000),
    ]);
    const ticketTypes: TicketTypeDef[] = ticketTypeRecords.map((r) => ({
      id: r.id,
      category: String(r.fields[FIELDS.ticketType.category] ?? ""),
      price: Number(r.fields[FIELDS.ticketType.price] ?? 0),
      fee: Number(r.fields[FIELDS.ticketType.fee] ?? 0),
      maxCount: Number(r.fields[FIELDS.ticketType.maxCount] ?? 0),
      priceGroup: priceGroupName(r.fields[FIELDS.ticketType.priceGroup]),
    }));
    const addons: AddonDef[] = addonRecords.map((r) => ({
      id: r.id,
      name: String(r.fields[FIELDS.addOn.name] ?? ""),
      price: Number(r.fields[FIELDS.addOn.price] ?? 0),
    }));

    // Onlinerabatten (10 % på tilvalg) gælder kun indtil kl. 12.00 dansk tid på
    // forestillingsdagen. Uden en kendt dato gives ingen rabat. Beregnes
    // serverside, så browserens tid aldrig kan omgå grænsen.
    const discountActive = show?.date ? onlineDiscountActive(show.date) : false;

    // Al validering og prisberegning ligger i den rene funktion — alle beløb
    // udledes af Airtable-værdierne, aldrig af input.
    const result = validateTicketCheckout(
      { tickets: body.tickets, addons: body.addons },
      {
        show,
        ticketTypes,
        addons,
        discountActive,
        showLabel: show ? showLabelFor(show) : "",
      }
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const customerRecord = await createRecord(TABLES.customers, {
      [FIELDS.customer.name]: customer.name,
      [FIELDS.customer.company]: customer.company || "",
      [FIELDS.customer.phone]: customer.phone || "",
      [FIELDS.customer.email]: customer.email || "",
    });
    const bookingNo = `BH-${Date.now().toString().slice(-8)}`;

    const bookingFields: Record<string, unknown> = {
      [FIELDS.booking.bookingNo]: bookingNo,
      [FIELDS.booking.ticketCount]: result.totals.ticketCount,
      [FIELDS.booking.specialRequests]: specialRequests || "",
      [FIELDS.booking.status]: "Afventer betaling",
      [FIELDS.booking.discount]: result.totals.discountKr,
      [FIELDS.booking.customer]: [customerRecord.id],
      [FIELDS.booking.ticketBreakdown]: result.ticketBreakdown,
      // Tilvalg gemmes på bookingen (én linje pr. vare), så en senere
      // genbestilling kan lægges oven i dem.
      [FIELDS.booking.addons]: result.addonBreakdown,
      // Ugættelig nøgle til genbestilling (/genbestil?ref=<nr>&n=<nøgle>).
      [FIELDS.booking.key]: generateBookingKey(),
    };
    if (showId) {
      bookingFields[FIELDS.booking.show] = [showId];
    }
    if (matching?.wantsMatching) {
      bookingFields[FIELDS.booking.wantsMatching] = true;
      if (matching.ageGroup) bookingFields[FIELDS.booking.ageGroup] = matching.ageGroup;
      if (matching.location) bookingFields[FIELDS.booking.location] = matching.location;
      if (matching.interests) bookingFields[FIELDS.booking.interests] = matching.interests;
      if (matching.drinkPreference)
        bookingFields[FIELDS.booking.drinkPreference] = matching.drinkPreference;
      if (matching.note) bookingFields[FIELDS.booking.matchNote] = matching.note;
    }
    const bookingRecord = await createRecord(TABLES.bookings, bookingFields);
    const origin = req.nextUrl.origin;

    // Ledger-linjer og forventet total kommer direkte fra de validerede linjer
    // (fuld pris pr. linje; rabatten er trukket fra i totalen). Præcis dette
    // beløb oprettes betalingen på, så det trukne stemmer med det viste.
    const ledgerLines: TicketLineItem[] = result.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      amountSubtotalOre: l.amountSubtotalOre,
    }));
    const expectedTotalOre = result.totals.totalOre;
    const discountOre = result.totals.discountOre;

    // Betaling oprettes hos den valgte udbyder (Viva) på tickets-sourcen.
    // tags[0] dirigerer webhooken; tags[1] bærer bookingId, så referencen kan
    // læses tilbage fra en verificeret transaktion — aldrig fra payloaden.
    const provider = getPaymentProvider("tickets");
    const payment = await provider.createPayment({
      orderId: bookingRecord.id,
      orderNumber: bookingNo,
      eventId: showId ?? "",
      totalOre: expectedTotalOre,
      currency: "dkk",
      description: `Bakkens Hvile · billetter · ${bookingNo}`,
      origin,
      expiresInMinutes: CHECKOUT_EXPIRY_MINUTES,
      sourceCode: vivaSourceCode("tickets"),
      tags: ["billet", bookingRecord.id],
      merchantTrns: `${bookingNo} · billetter`,
    });

    // Gem det forventede total (til beløbskontrol) + linjer (til mailen) FØR
    // gæsten sendes til betaling. Fejler dette, sendes gæsten ikke afsted.
    await createTicketPayment(getDb(), {
      paymentRef: payment.paymentRef,
      flow: "billet",
      bookingId: bookingRecord.id,
      bookingNo,
      customerEmail: customer.email || null,
      customerName: customer.name,
      expectedTotalOre,
      discountOre,
      lineItems: ledgerLines,
    });

    return NextResponse.json({ url: payment.redirectUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Booking kunne ikke oprettes. Prøv igen." },
      { status: 500 }
    );
  }
}
