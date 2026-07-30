// Ren håndtering af Stripe-webhook-events for bordbestillingen. Signaturen
// verificeres i selve ruten (mod den rå body); denne funktion tager det
// færdig-verificerede event og opdaterer databasen idempotent.
//
// Beløb og valuta aflæses direkte på sessionen i eventet og kontrolleres mod
// ordrekladden i markOrderPaidByRef — en forkert eller forfalsket betaling afvises.

import type Stripe from "stripe";
import type { Queryable } from "@/lib/db";
import {
  markOrderFailedByRef,
  markOrderPaidByRef,
  markOrderRefundedByRef,
  type MarkPaidResult,
} from "@/lib/orders";

export type WebhookOutcome =
  | { handled: true; type: string; result?: MarkPaidResult | boolean }
  | { handled: false; type: string };

// Kun bordbestillingens egne sessions håndteres (metadata.kind).
export function isTableOrderSession(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.kind === "table-order";
}

export async function handleTableWebhookEvent(
  db: Queryable,
  event: Stripe.Event
): Promise<WebhookOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!isTableOrderSession(session)) return { handled: false, type: event.type };
      // Levering frigives kun ved verificeret betaling.
      if (session.payment_status !== "paid") {
        return { handled: true, type: event.type };
      }
      const result = await markOrderPaidByRef(db, {
        provider: "stripe",
        paymentRef: session.id,
        transactionId:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
        amountTotalOre: session.amount_total ?? -1,
        currency: session.currency ?? "",
      });
      return { handled: true, type: event.type, result };
    }

    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!isTableOrderSession(session)) return { handled: false, type: event.type };
      const result = await markOrderFailedByRef(db, "stripe", session.id);
      return { handled: true, type: event.type, result };
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      // Kobles til ordren via checkout-sessionen. Airtable-spejling håndteres
      // separat af sales-registration ved refundering.
      const sessionId = charge.metadata?.checkoutSessionId;
      if (!sessionId) return { handled: false, type: event.type };
      const result = await markOrderRefundedByRef(db, "stripe", sessionId);
      return { handled: true, type: event.type, result };
    }

    default:
      return { handled: false, type: event.type };
  }
}
