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
  eventId: string;
  totalOre: number; // altid øre, altid serverberegnet
  // Bord-/Stripe-specifikke felter (bruges kun af bordbestilling + Stripe).
  publicToken?: string;
  tableNumber?: number;
  currency: "dkk";
  description: string;
  origin: string;
  expiresInMinutes: number;
  // Findes en betalingsreference allerede på ordren, genbruges den i stedet for
  // at oprette en ny betaling (vores egen idempotens).
  existingRef?: string | null;
  // Hvilken Viva payment source betalingen skal oprettes på (success/failure-URL
  // sidder på sourcen, ikke på den enkelte betaling). Udelades → providerens
  // default. Ignoreres af Stripe.
  sourceCode?: string;
  // Entydig reference, der kan læses tilbage fra en verificeret transaktion:
  //  - tags[0] dirigerer webhooken (fx "billet" | "genbestil" | "bordbestilling")
  //  - efterfølgende tags bærer id'er (fx bookingId / eventId)
  // Udelades ved Viva → provideren falder tilbage på bordbestillingens tags.
  tags?: string[];
  // Fritekst der vises i Vivas dashboard. Udelades → orderNumber.
  merchantTrns?: string;
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
