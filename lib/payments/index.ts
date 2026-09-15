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
 * bestillingen og gavekortet har hver sit. De tre flows går live uafhængigt, så
 * hvert har sit eget flag — ellers kunne gavekortet ikke gå live uden også at
 * tænde billetsalget, og billetter ikke uden bordbestillingen (som desuden
 * kræver et lovligt kassesystem).
 */
export type LiveScope = "tickets" | "table" | "gavekort";

/** Billet/genbestillings live-flag. Default false (fejler lukket mod live). */
export function ticketsLiveMode(): boolean {
  return process.env.TICKETS_LIVE === "true";
}

/**
 * Gavekortets live-flag. Default false (fejler lukket mod live). Bevidst adskilt
 * fra TICKETS_LIVE: gavekortet sælges uafhængigt af billetsalget og skal kunne
 * gå live, mens billetsalget stadig er under test.
 */
export function gavekortLiveMode(): boolean {
  return process.env.GAVEKORT_LIVE === "true";
}

/** Udbyderens navn. Hele sitet betaler via Viva. */
export function getConfiguredProviderName(): PaymentProviderName {
  return "viva";
}

/**
 * Flagets navn og aflæsning pr. flow. Ét sted, så et nyt flow ikke kan komme
 * til at arve et andet flows flag.
 */
const LIVE_FLAGS: Record<LiveScope, { name: string; isLive: () => boolean }> = {
  tickets: { name: "TICKETS_LIVE", isLive: ticketsLiveMode },
  table: { name: "TABLE_ORDERING_LIVE", isLive: isLiveMode },
  gavekort: { name: "GAVEKORT_LIVE", isLive: gavekortLiveMode },
};

/**
 * Værn mod utilsigtet Viva-livebetaling: VIVA_ENV=live må aldrig bruges, når
 * det pågældende flows live-flag ikke er true. Tickets-flowet (billet +
 * genbestilling) gates på TICKETS_LIVE, bordbestillingen på TABLE_ORDERING_LIVE
 * og gavekortet på GAVEKORT_LIVE. De tre er bevidst afkoblede, så hvert flow kan
 * gå live uafhængigt af de andre. Kaster (fail-closed), hvis kombinationen er
 * ulovlig. Kaldes i getPaymentProvider, så den ikke kan omgås ved at importere
 * provideren direkte.
 */
export function assertVivaLiveAllowed(scope: LiveScope): void {
  if (getVivaEnv() !== "live") return;
  const flag = LIVE_FLAGS[scope];
  if (!flag.isLive()) {
    throw new Error(
      `Viva live er slået fra (${flag.name}=false), men VIVA_ENV=live.`
    );
  }
}

/** Returnerer den live-godkendte betalingsudbyder for det givne flow. */
export function getPaymentProvider(scope: LiveScope): PaymentProvider {
  assertVivaLiveAllowed(scope);
  return vivaProvider;
}
