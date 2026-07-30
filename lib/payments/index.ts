// Valg af betalingsudbyder. PAYMENT_PROVIDER styrer, om bordbestillingen bruger
// Stripe eller Viva — skift tilbage til Stripe kræver kun ét miljøvariabel-
// skift. Live-værnet for Viva håndhæves her (i getPaymentProvider), så det
// ikke kan omgås ved at importere en provider direkte.

import type { PaymentProvider, PaymentProviderName } from "@/lib/payments/types";
import { stripeProvider } from "@/lib/payments/stripe";
import { vivaProvider } from "@/lib/payments/viva";
import { getVivaEnv } from "@/lib/payments/viva-client";
import { isLiveMode } from "@/lib/table-ordering-config";

/** Den konfigurerede udbyder ud fra PAYMENT_PROVIDER. Default: stripe. */
export function getConfiguredProviderName(): PaymentProviderName {
  return process.env.PAYMENT_PROVIDER === "viva" ? "viva" : "stripe";
}

/**
 * Værn mod utilsigtet Viva-livebetaling: VIVA_ENV=live må aldrig bruges, når
 * TABLE_ORDERING_LIVE ikke er true. Kaster (fail-closed), hvis kombinationen er
 * ulovlig. Samme princip som assertLivePaymentAllowed for Stripe.
 */
export function assertVivaLiveAllowed(): void {
  if (getVivaEnv() === "live" && !isLiveMode()) {
    throw new Error(
      "Viva live er slået fra (TABLE_ORDERING_LIVE=false), men VIVA_ENV=live."
    );
  }
}

/** Returnerer den valgte, live-godkendte betalingsudbyder. */
export function getPaymentProvider(): PaymentProvider {
  const name = getConfiguredProviderName();
  if (name === "viva") {
    assertVivaLiveAllowed();
    return vivaProvider;
  }
  return stripeProvider;
}
