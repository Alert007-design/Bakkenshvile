// TIDLIGERE: Stripe-webhook for bordbestillingen. Hele sitet betaler nu via
// Viva, og bordbestillingen håndteres af den fælles Viva-webhook
// (/api/table-orders/viva/webhook, dirigeret på tag "bordbestilling").
//
// Ruten beholdes som en tom, sikker stub, så en gammel Stripe-webhook-
// konfiguration ikke giver fejl, hvis den stadig peger hertil. Stripe-koden er
// bevaret som død kode (lib/stripe.ts, lib/table-webhook.ts, lib/payments/
// stripe.ts), men intet flow bruger den længere.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ received: true, deprecated: true });
}
