// Fælles betalingsabstraktion for bordbestillingen. Stripe og Viva ligger begge
// bag dette ene interface, så udbyderen kan skiftes med miljøvariablen
// PAYMENT_PROVIDER uden at røre ordre-, checkout- eller webhook-logikken.
//
// VIGTIGT: Alle beløb i dette lag er i HELE ØRE (heltal). Den enkelte provider
// står selv for at omregne til/fra sit eget format (fx Vivas kroner-decimaltal).
// Ingen kode uden for en provider må arbejde med kroner som flydende komma.

export type PaymentProviderName = "stripe" | "viva";

/** Alt en provider har brug for at oprette en betaling. */
export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  publicToken: string;
  eventId: string;
  tableNumber: number;
  totalOre: number; // altid øre, altid serverberegnet
  currency: "dkk";
  description: string;
  origin: string;
  expiresInMinutes: number;
  // Findes en betalingsreference allerede på ordren, genbruges den i stedet for
  // at oprette en ny betaling (vores egen idempotens).
  existingRef?: string | null;
}

export interface CreatePaymentResult {
  redirectUrl: string;
  paymentRef: string; // Stripe session-id ELLER Vivas orderCode (streng)
}

/**
 * Resultatet af en verificeret betaling, hentet direkte hos udbyderen (aldrig
 * fra en webhook-payload). Beløbet er altid i øre og valutaen normaliseret.
 */
export interface VerifiedPayment {
  paymentRef: string;
  transactionId: string | null;
  amountOre: number;
  currency: string;
  status: "paid" | "pending" | "failed" | "refunded";
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(lookup: {
    paymentRef?: string | null;
    transactionId?: string | null;
  }): Promise<VerifiedPayment | null>;
}
