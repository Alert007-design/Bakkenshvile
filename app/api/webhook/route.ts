// TIDLIGERE: Stripe-webhook for billetkøb. Hele sitet betaler nu via Viva, og
// billetbekræftelser håndteres af den fælles Viva-webhook
// (/api/table-orders/viva/webhook, dirigeret på tag "billet"/"genbestil").
//
// Ruten beholdes som en tom, sikker stub, så en gammel Stripe-webhook-
// konfiguration ikke giver fejl (og dermed retry-storme) hvis den stadig peger
// hertil. Stripe-koden er bevaret som død kode i lib/payments/stripe.ts, men
// intet flow bruger den længere.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ received: true, deprecated: true });
}
