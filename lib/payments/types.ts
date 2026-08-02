// Fælles betalingsabstraktion for hele sitet. Viva ligger bag dette ene
// interface, så al ordre-, checkout- og webhook-logik er uafhængig af selve
// udbyderen (og en anden udbyder i teorien kunne tilføjes uden at røre dem).
//
// VIGTIGT: Alle beløb i dette lag er i HELE ØRE (heltal). Provideren står selv
// for at omregne til/fra sit eget format (fx Vivas kroner-decimaltal). Ingen
// kode uden for provideren må arbejde med kroner som flydende komma.

export type PaymentProviderName = "viva";

/** Alt en provider har brug for at oprette en betaling. */
export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  eventId: string;
  totalOre: number; // altid øre, altid serverberegnet
  // Bordspecifikke felter (bruges kun af bordbestillingen).
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
  // default.
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
  paymentRef: string; // Vivas orderCode (16-cifret streng)
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
