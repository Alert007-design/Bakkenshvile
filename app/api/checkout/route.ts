import { NextRequest, NextResponse } from "next/server";
import { createRecord, getRecord, TABLES, FIELDS } from "@/lib/airtable";
import { getDb } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { vivaSourceCode } from "@/lib/payments/viva-client";
import { createTicketPayment, type TicketLineItem } from "@/lib/ticket-payments";
import { addonsTotalDiscountKr } from "@/lib/pricing";
import {
  addonBreakdown,
  generateBookingKey,
  onlineDiscountActive,
} from "@/lib/genbestil";

// Betalingen udløber efter 30 min. (samme vindue som bordbestillingen).
const CHECKOUT_EXPIRY_MINUTES = 30;

type LineItem = {
  name: string;
  unitAmount: number;
  quantity: number;
  kind?: "ticket" | "addon";
};

// Trækker billetkategorierne ud af lineItems og opsummerer antal pr.
// kategori, fx "A+ x2, B x1". Kun linjer der matcher det navneformat,
// BookingClient sender for billetter ("Billet: <kategori> — <showlabel>"),
// tælles med — tilvalg (drinks/mad) har ikke dette præfiks og ignoreres.
function summarizeTicketCategories(lineItems: LineItem[]): string {
  const totals = new Map<string, number>();
  for (const li of lineItems) {
    const match = li.name.match(/^Billet: (.+?) —/);
    if (!match) continue;
    const category = match[1].trim();
    totals.set(category, (totals.get(category) || 0) + li.quantity);
  }
  return Array.from(totals.entries())
    .map(([category, qty]) => `${category} x${qty}`)
    .join(", ");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      customer,
      specialRequests,
      ticketCount,
      lineItems,
      showId,
      matching,
      acceptTerms,
    }: {
      customer: {
        name: string;
        company?: string;
        address?: string;
        zip?: string;
        phone?: string;
        email?: string;
      };
      specialRequests?: string;
      ticketCount: number;
      lineItems: LineItem[];
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
    if (!lineItems?.length) {
      return NextResponse.json(
        { error: "Vælg mindst én billet" },
        { status: 400 }
      );
    }
    // Serverside-værn: en udsolgt dato må aldrig kunne føres til betaling,
    // heller ikke hvis klienten manipuleres til at sende showId'et alligevel.
    // Samme opslag giver os forestillingsdatoen, som rabatgrænsen beregnes ud
    // fra (kl. 12.00 dansk tid på forestillingsdagen).
    let showDate = "";
    if (showId) {
      const event = await getRecord(TABLES.events, showId);
      if (event.fields[FIELDS.event.soldOut]) {
        return NextResponse.json(
          { error: "Denne dato er udsolgt og kan ikke bestilles." },
          { status: 409 }
        );
      }
      showDate = String(event.fields[FIELDS.event.date] ?? "");
    }
    // Onlinerabatten gælder kun indtil kl. 12.00 dansk tid på forestillingsdagen.
    // Uden en kendt dato gives ingen rabat (fuld pris). Beregnes serverside, så
    // browserens tid aldrig kan omgå grænsen.
    const discountActive = showDate ? onlineDiscountActive(showDate) : false;
    const customerRecord = await createRecord(TABLES.customers, {
      [FIELDS.customer.name]: customer.name,
      [FIELDS.customer.company]: customer.company || "",
      [FIELDS.customer.address]: customer.address || "",
      [FIELDS.customer.zip]: customer.zip || "",
      [FIELDS.customer.phone]: customer.phone || "",
      [FIELDS.customer.email]: customer.email || "",
    });
    const bookingNo = `BH-${Date.now().toString().slice(-8)}`;
    const ticketBreakdown = summarizeTicketCategories(lineItems);
    // Tilvalg gemmes på bookingen (én linje pr. vare), så en senere
    // genbestilling kan lægges oven i dem.
    const addonsText = addonBreakdown(
      lineItems.filter((li) => li.kind === "addon")
    );

    // Onlinerabat: 10% på tilvalg — men KUN indtil kl. 12.00 dansk tid på
    // forestillingsdagen. Efter deadline er der ingen rabat (fuld pris).
    // Beregnes serverside som summen af de enhedsfloorede rabatter via den
    // delte hjælpefunktion — nøjagtig samme tal som frontend viser, så det
    // viste og det trukne aldrig kan afvige.
    const discount = discountActive
      ? addonsTotalDiscountKr(
          lineItems
            .filter((li) => li.kind === "addon")
            .map((li) => ({ unitKr: li.unitAmount, quantity: li.quantity }))
        )
      : 0;

    const bookingFields: Record<string, unknown> = {
      [FIELDS.booking.bookingNo]: bookingNo,
      [FIELDS.booking.ticketCount]: ticketCount || 0,
      [FIELDS.booking.specialRequests]: specialRequests || "",
      [FIELDS.booking.status]: "Afventer betaling",
      [FIELDS.booking.discount]: discount,
      [FIELDS.booking.customer]: [customerRecord.id],
      [FIELDS.booking.ticketBreakdown]: ticketBreakdown,
      [FIELDS.booking.addons]: addonsText,
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

    // Beløb genberegnes serverside og opgøres i øre. Linjebeløbene lægges op
    // til det forventede total, som rabatten (floored kronebeløb → øre) trækkes
    // fra. Præcis dette beløb oprettes betalingen på, så det trukne stemmer med
    // det viste (linjesum − rabat).
    const ledgerLines: TicketLineItem[] = lineItems.map((li) => ({
      description: li.name,
      quantity: li.quantity,
      amountSubtotalOre: Math.round(li.unitAmount * 100) * li.quantity,
    }));
    const discountOre = Math.round(discount * 100);
    const expectedTotalOre =
      ledgerLines.reduce((sum, l) => sum + l.amountSubtotalOre, 0) - discountOre;

    // Betaling oprettes hos den valgte udbyder (Viva) på tickets-sourcen.
    // tags[0] dirigerer webhooken; tags[1] bærer bookingId, så referencen kan
    // læses tilbage fra en verificeret transaktion — aldrig fra payloaden.
    const provider = getPaymentProvider();
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
