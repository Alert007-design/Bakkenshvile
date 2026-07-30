// Viva.com-provideren bag det fælles PaymentProvider-interface. Oversætter
// mellem vores ordre-verden (altid øre, valuta "dkk") og Vivas format (kroner
// som decimaltal, ISO-numerisk valuta). Al Viva-specifik viden om beløb,
// valuta og status samles her.

import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  VerifiedPayment,
} from "@/lib/payments/types";
import {
  createVivaOrder,
  retrieveVivaTransaction,
  vivaCheckoutUrl,
  vivaSourceCode,
  type VivaTransaction,
} from "@/lib/payments/viva-client";

/**
 * Omregner et Viva-beløb i KRONER (decimaltal) til hele øre.
 *
 * Faldgrube: /checkout/v2/orders tager beløb i øre, men Retrieve Transaction og
 * webhook-payloads returnerer kroner som decimaltal (fx 100.5). Viva returnerer
 * altid højst to decimaler, så en enkel afrunding er tilstrækkelig:
 *   100.5 → 10050
 *   8.15  → 815
 * Kun ét sted i koden må lave denne konvertering.
 */
export function kronerToOre(amount: number | string): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) {
    throw new Error(`Ugyldigt Viva-beløb: ${amount}`);
  }
  return Math.round(n * 100);
}

/**
 * Oversætter Vivas statusId til vores betalingsstatus. KUN "F" (Finished) giver
 * "paid". Alt andet giver "pending" — altså ingen tilstandsændring. Vi gætter
 * bevidst ikke på andre af Vivas koder (fail-closed).
 */
export function mapVivaStatus(statusId: string): "paid" | "pending" {
  return String(statusId).toUpperCase() === "F" ? "paid" : "pending";
}

/**
 * Normaliserer Vivas ISO-numeriske valutakode til vores interne streng.
 * DKK = 208 → "dkk". Andre koder returneres i småt, så de aldrig ved en fejl
 * matcher "dkk" i beløbskontrollen (fail-closed).
 */
export function normalizeVivaCurrency(code: string | number): string {
  return String(code) === "208" ? "dkk" : String(code).toLowerCase();
}

/**
 * Oversætter en verificeret Viva-transaktion til vores fælles VerifiedPayment.
 * Beløb → øre, valuta → normaliseret, status via mapVivaStatus. Deles af
 * verifyPayment og den fælles webhook, så konverteringen kun findes ét sted.
 */
export function verifiedFromTransaction(txn: VivaTransaction): VerifiedPayment {
  return {
    paymentRef: txn.orderCode,
    transactionId: txn.transactionId,
    amountOre: kronerToOre(txn.amount),
    currency: normalizeVivaCurrency(txn.currencyCode),
    status: mapVivaStatus(txn.statusId),
  };
}

async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  // Vores egen idempotens: findes der allerede en orderCode på ordren, sendes
  // gæsten til den samme checkout uden at oprette en ny Viva-ordre.
  if (input.existingRef) {
    return {
      redirectUrl: vivaCheckoutUrl(input.existingRef),
      paymentRef: input.existingRef,
    };
  }

  const orderCode = await createVivaOrder({
    amountOre: input.totalOre,
    customerTrns: input.description,
    merchantTrns: input.merchantTrns ?? input.orderNumber,
    paymentTimeoutSeconds: input.expiresInMinutes * 60,
    // Sourcen bestemmer success/failure-URL. Udelades den, falder vi tilbage på
    // bordbestillingens source (bagudkompatibelt).
    sourceCode: input.sourceCode ?? vivaSourceCode("table"),
    // tags[0] dirigerer den fælles webhook. Uden eksplicitte tags antages
    // bordbestilling (bagudkompatibelt for eksisterende kaldere).
    tags: input.tags ?? ["bordbestilling", input.eventId],
  });

  return {
    redirectUrl: vivaCheckoutUrl(orderCode),
    paymentRef: orderCode,
  };
}

async function verifyPayment(lookup: {
  paymentRef?: string | null;
  transactionId?: string | null;
}): Promise<VerifiedPayment | null> {
  // Uden et transactionId kan intet verificeres hos Viva (fail-closed).
  if (!lookup.transactionId) return null;

  const txn = await retrieveVivaTransaction(lookup.transactionId);
  if (!txn) return null;

  // Er der medsendt et forventet paymentRef (orderCode), SKAL den hentede
  // transaktions orderCode matche — ellers hører transaktionen ikke til ordren.
  if (lookup.paymentRef && txn.orderCode !== lookup.paymentRef) {
    throw new Error(
      "Viva-transaktionens orderCode matcher ikke den forventede reference"
    );
  }

  return verifiedFromTransaction(txn);
}

export const vivaProvider: PaymentProvider = {
  name: "viva",
  createPayment,
  verifyPayment,
};
