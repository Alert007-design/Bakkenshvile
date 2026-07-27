// Adskilte betalings- og leveringsstatusser med eksplicitte, gyldige overgange.
// En ordre kan ALDRIG flyttes gennem en ugyldig overgang (spec-krav). Bruges
// både af barens statusknapper og af webhooken.

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type FulfillmentStatus =
  | "new"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

// Leveringsforløb: new → preparing → ready → delivered. Kan annulleres fra alle
// ikke-afsluttede tilstande. delivered og cancelled er slutttilstande.
const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  new: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

// Betaling: pending → paid/failed; paid → refunded. failed og refunded er
// slutttilstande.
const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ["paid", "failed"],
  paid: ["refunded"],
  failed: [],
  refunded: [],
};

export function canTransitionFulfillment(
  from: FulfillmentStatus,
  to: FulfillmentStatus
): boolean {
  return FULFILLMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus
): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Kaster hvis leveringsovergangen ikke er tilladt. */
export function assertFulfillmentTransition(
  from: FulfillmentStatus,
  to: FulfillmentStatus
): void {
  if (!canTransitionFulfillment(from, to)) {
    throw new Error(`Ugyldig leveringsovergang: ${from} → ${to}`);
  }
}

/** Kaster hvis betalingsovergangen ikke er tilladt. */
export function assertPaymentTransition(
  from: PaymentStatus,
  to: PaymentStatus
): void {
  if (!canTransitionPayment(from, to)) {
    throw new Error(`Ugyldig betalingsovergang: ${from} → ${to}`);
  }
}

// Tidsstempel-feltet der sættes ved en given leveringsovergang, så barens
// statistik (tid fra betaling→start→klar→leveret) kan beregnes.
export const FULFILLMENT_TIMESTAMP: Record<FulfillmentStatus, string | null> = {
  new: null,
  preparing: "startedAt",
  ready: "readyAt",
  delivered: "deliveredAt",
  cancelled: "cancelledAt",
};

export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  new: "Ny",
  preparing: "I gang",
  ready: "Klar",
  delivered: "Leveret",
  cancelled: "Annulleret",
};
