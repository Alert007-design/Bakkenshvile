import { NextRequest, NextResponse } from "next/server";
import { createRecord, TABLES, FIELDS } from "@/lib/airtable";
import { getStripe } from "@/lib/stripe";

type LineItem = { name: string; unitAmount: number; quantity: number };

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

    const customerRecord = await createRecord(TABLES.customers, {
      [FIELDS.customer.name]: customer.name,
      [FIELDS.customer.company]: customer.company || "",
      [FIELDS.customer.address]: customer.address || "",
      [FIELDS.customer.zip]: customer.zip || "",
      [FIELDS.customer.phone]: customer.phone || "",
      [FIELDS.customer.email]: customer.email || "",
    });

    const bookingNo = `BH-${Date.now().toString().slice(-8)}`;

    const bookingFields: Record<string, unknown> = {
      [FIELDS.booking.bookingNo]: bookingNo,
      [FIELDS.booking.ticketCount]: ticketCount || 0,
      [FIELDS.booking.specialRequests]: specialRequests || "",
      [FIELDS.booking.status]: "Afventer betaling",
      [FIELDS.booking.customer]: [customerRecord.id],
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
