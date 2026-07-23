import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { updateRecord, TABLES, FIELDS } from "@/lib/airtable";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    if (!sig || !secret) throw new Error("Webhook-signatur mangler");
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("Webhook-signatur ugyldig", err);
    return NextResponse.json({ error: "Ugyldig signatur" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.bookingId;
    if (bookingId) {
      try {
        await updateRecord(TABLES.bookings, bookingId, {
          [FIELDS.booking.status]: "Betalt",
        });
      } catch (err) {
        console.error("Kunne ikke opdatere booking i Airtable", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
