import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { handleTableWebhookEvent } from "@/lib/table-webhook";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  // Særskilt secret — IKKE billet-webhookens.
  const secret = process.env.STRIPE_TABLE_WEBHOOK_SECRET;
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    if (!sig || !secret) throw new Error("Webhook-signatur mangler");
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    // Log uden hemmeligheder/betalingsdata.
    console.error("Bord-webhook: ugyldig signatur");
    return NextResponse.json({ error: "Ugyldig signatur" }, { status: 400 });
  }

  try {
    await handleTableWebhookEvent(getDb(), event);
  } catch (err) {
    console.error(`Bord-webhook: fejl under håndtering af ${event.type}`);
    // 500 → Stripe prøver igen; håndteringen er idempotent.
    return NextResponse.json({ error: "Intern fejl" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
