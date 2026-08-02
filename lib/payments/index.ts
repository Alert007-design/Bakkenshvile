// Betalingsudbyder. Hele sitet betaler via Viva; abstraktionen bevares, så
// ordre-, checkout- og webhook-logikken er uafhængig af udbyderen. Live-værnet
// for Viva håndhæves her (i getPaymentProvider), pr. flow, så det ikke kan
// omgås ved at importere provideren direkte.

import type { PaymentProvider, PaymentProviderName } from "@/lib/payments/types";
import { vivaProvider } from "@/lib/payments/viva";
import { getVivaEnv } from "@/lib/payments/viva-client";
import { isLiveMode } from "@/lib/table-ordering-config";

/**
 * Live-værnets omfang. Billet og genbestilling deler tickets-flowet; bord-
 * bestillingen har sit eget. De to flows går live uafhængigt, så hvert har sit
 * eget flag — ellers kunne billetter ikke gå live uden også at tænde bord-
 * bestillingen (som desuden kræver et lovligt kassesystem).
 */
export type LiveScope = "tickets" | "table";

/** Billet/genbestillings live-flag. Default false (fejler lukket mod live). */
export function ticketsLiveMode(): boolean {
  return process.env.TICKETS_LIVE === "true";
}

/** Udbyderens navn. Hele sitet betaler via Viva. */
export function getConfiguredProviderName(): PaymentProviderName {
  return "viva";
}

/**
 * Værn mod utilsigtet Viva-livebetaling: VIVA_ENV=live må aldrig bruges, når
 * det pågældende flows live-flag ikke er true. Tickets-flowet (billet +
 * genbestilling) gates på TICKETS_LIVE; bordbestillingen på TABLE_ORDERING_LIVE.
 * De to er bevidst afkoblede, så billetter kan gå live uafhængigt af bordpiloten.
 * Kaster (fail-closed), hvis kombinationen er ulovlig. Kaldes i
 * getPaymentProvider, så den ikke kan omgås ved at importere provideren direkte.
 */
export function assertVivaLiveAllowed(scope: LiveScope): void {
  if (getVivaEnv() !== "live") return;
  const allowed = scope === "table" ? isLiveMode() : ticketsLiveMode();
  if (!allowed) {
    const flag = scope === "table" ? "TABLE_ORDERING_LIVE" : "TICKETS_LIVE";
    throw new Error(
      `Viva live er slået fra (${flag}=false), men VIVA_ENV=live.`
    );
  }
}

/** Returnerer den live-godkendte betalingsudbyder for det givne flow. */
export function getPaymentProvider(scope: LiveScope): PaymentProvider {
  assertVivaLiveAllowed(scope);
  return vivaProvider;
}
