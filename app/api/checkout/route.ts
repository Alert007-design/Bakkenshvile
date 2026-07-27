import { NextRequest, NextResponse } from "next/server";
import { createRecord, getRecord, TABLES, FIELDS } from "@/lib/airtable";
import { getStripe } from "@/lib/stripe";
import { addonsTotalDiscountKr, ADDON_DISCOUNT_LABEL } from "@/lib/pricing";

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
    } = body;
    if (!customer?.name || (!customer?.phone && !customer?.email)) {
      return NextResponse.json(
        { error: "Navn samt telefon eller email er påkrævet" },
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
    if (showId) {
      const event = await getRecord(TABLES.events, showId);
      if (event.fields[FIELDS.event.soldOut]) {
        return NextResponse.json(
          { error: "Denne dato er udsolgt og kan ikke bestilles." },
          { status: 409 }
        );
      }
    }
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

    // Onlinerabat: 10% på tilvalg. Beregnes serverside som summen af de
    // enhedsfloorede rabatter via den delte hjælpefunktion — nøjagtig samme
    // tal som frontend viser, så det viste og det trukne aldrig kan afvige.
    const discount = addonsTotalDiscountKr(
      lineItems
        .filter((li) => li.kind === "addon")
        .map((li) => ({ unitKr: li.unitAmount, quantity: li.quantity }))
    );

    const bookingFields: Record<string, unknown> = {
      [FIELDS.booking.bookingNo]: bookingNo,
      [FIELDS.booking.ticketCount]: ticketCount || 0,
      [FIELDS.booking.specialRequests]: specialRequests || "",
      [FIELDS.booking.status]: "Afventer betaling",
      [FIELDS.booking.discount]: discount,
      [FIELDS.booking.customer]: [customerRecord.id],
      // Feltet "Billetkategorier" (fldXuocW3IneLzwnY) i Airtable —
      // tilføjet direkte som felt-ID, da det endnu ikke er lagt ind i
      // FIELDS-mappingen i lib/airtable.ts. Overvej at tilføje
      // "ticketBreakdown: 'fldXuocW3IneLzwnY'" til FIELDS.booking der,
      // og skift nøglen herunder til FIELDS.booking.ticketBreakdown.
      fldXuocW3IneLzwnY: ticketBreakdown,
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
    const stripe = getStripe();

    // Rabatten lægges på som en engangs-coupon (amount_off) frem for en
    // negativ linje — Stripe tillader ikke negative line items, og en coupon
    // giver den pæneste kvittering med en selvstændig rabatlinje. Beløbet er
    // det floored kronebeløb ganget op til øre, så det trukne total stemmer
    // præcis med det viste (linjesum − rabat).
    let discountParam: { coupon: string }[] | undefined;
    if (discount > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(discount * 100),
        currency: "dkk",
        duration: "once",
        name: ADDON_DISCOUNT_LABEL,
      });
      discountParam = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      locale: "da",
      line_items: lineItems.map((li) => ({
        quantity: li.quantity,
        price_data: {
          currency: "dkk",
          unit_amount: Math.round(li.unitAmount * 100),
          product_data: { name: li.name },
        },
      })),
      discounts: discountParam,
      customer_email: customer.email || undefined,
      metadata: {
        bookingId: bookingRecord.id,
        bookingNo,
      },
      success_url: `${origin}/success?booking=${bookingNo}`,
      cancel_url: `${origin}/?cancelled=1`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Booking kunne ikke oprettes. Prøv igen." },
      { status: 500 }
    );
  }
}
