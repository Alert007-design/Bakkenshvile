// Central konfiguration og sikkerhedskontakter for bordbestillingen.

// Grænser (serverside-værn mod misbrug og fejlindtastning).
export const MAX_PER_ITEM = 20; // maks antal af samme vare
export const MAX_TOTAL_ITEMS = 40; // maks antal varer i alt pr. ordre
export const MAX_ORDER_TOTAL_ORE = 500_000; // maks samlet ordrebeløb (5.000 kr)
export const MAX_GUEST_NAME_LENGTH = 60;
export const MAX_MESSAGE_LENGTH = 280;

// Stripe Checkout-sessionens levetid.
export const CHECKOUT_EXPIRY_MINUTES = 30;

// Rate limiting for checkout pr. IP+bordtoken.
export const CHECKOUT_RATE_LIMIT = 8; // maks forsøg
export const CHECKOUT_RATE_WINDOW_MS = 60_000; // pr. minut

// --- Sikkerhedskontakter (default false) --------------------------------------
// Ingen del af systemet må tage imod bestillinger før ENABLED er true, og ingen
// livebetaling må ske før LIVE er true OG lovpligtig salgsregistrering er
// konfigureret.

export function isOrderingEnabled(): boolean {
  return process.env.TABLE_ORDERING_ENABLED === "true";
}

export function isLiveMode(): boolean {
  return process.env.TABLE_ORDERING_LIVE === "true";
}

/**
 * Værn mod utilsigtet livebetaling: en live Stripe-nøgle (sk_live_) må aldrig
 * bruges, når TABLE_ORDERING_LIVE ikke er true. Kaster hvis kombinationen er
 * ulovlig, så en livebetaling er umulig uden eksplicit live-tilstand.
 */
export function assertLivePaymentAllowed(stripeKey: string | undefined): void {
  const isLiveKey = (stripeKey ?? "").startsWith("sk_live_");
  if (isLiveKey && !isLiveMode()) {
    throw new Error(
      "Livebetaling er slået fra (TABLE_ORDERING_LIVE=false), men Stripe-nøglen er en live-nøgle."
    );
  }
}
