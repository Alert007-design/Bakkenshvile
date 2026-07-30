// Stripe bag det fælles PaymentProvider-interface. Indpakning af den hidtidige
// Stripe Checkout-logik for bordbestillingen — adfærd uændret. Beholder den
// idempotency-nøgle (`table-checkout-${orderId}`), der gør, at et dobbelt-POST
// for samme ordrekladde altid giver den samme Stripe-session.
//
// Bemærk: det fælles interface bærer kun ét totalbeløb (totalOre), ikke selve
// varelinjerne. Stripe-sessionen får derfor én samlet linje med ordrens
// beskrivelse — linjedetaljerne findes i Postgres og på kvitteringssiden.

import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  VerifiedPayment,
} from "@/lib/payments/types";
import { getStripe } from "@/lib/stripe";

async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      // payment_method_types udelades bevidst: Stripe Checkout viser så de
      // metoder der er slået til i Dashboard (MobilePay + kort) og vælger selv
      // visning/rækkefølge.
      locale: "da",
      currency: input.currency,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency,
            unit_amount: input.totalOre, // allerede i øre
            product_data: { name: input.description },
          },
        },
      ],
      expires_at: Math.floor(Date.now() / 1000) + input.expiresInMinutes * 60,
      metadata: {
        kind: "table-order",
        orderId: input.orderId,
        tableNumber: String(input.tableNumber ?? ""),
        eventId: input.eventId,
      },
      // publicToken lægges med, så kvitteringssiden kan polle egen ordre.
      success_url: `${input.origin}/bord/${input.tableNumber ?? ""}/kvittering?session_id={CHECKOUT_SESSION_ID}&t=${input.publicToken ?? ""}`,
      cancel_url: `${input.origin}/bord/${input.tableNumber ?? ""}?afbrudt=1`,
    },
    // Idempotency: dobbelt-POST for samme kladde giver samme session.
    { idempotencyKey: `table-checkout-${input.orderId}` }
  );

  if (!session.url) {
    throw new Error("Stripe-session manglede URL");
  }
  return { redirectUrl: session.url, paymentRef: session.id };
}

async function verifyPayment(lookup: {
  paymentRef?: string | null;
  transactionId?: string | null;
}): Promise<VerifiedPayment | null> {
  if (!lookup.paymentRef) return null;
  const session = await getStripe().checkout.sessions.retrieve(lookup.paymentRef);
  if (!session) return null;
  return {
    paymentRef: session.id,
    transactionId:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
    amountOre: session.amount_total ?? 0,
    currency: session.currency ?? "",
    status: session.payment_status === "paid" ? "paid" : "pending",
  };
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  createPayment,
  verifyPayment,
};
