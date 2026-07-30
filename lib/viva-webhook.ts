// Dirigering af Vivas fælles webhook. Viva sender ALLE transaktioner på kontoen
// til det samme endpoint, så vi router på transaktionens FØRSTE tag (som vi selv
// satte ved oprettelsen og læser tilbage fra den verificerede transaktion —
// aldrig fra webhook-payloaden).

export type VivaFlow = "billet" | "genbestil" | "bordbestilling";

/**
 * Bestemmer hvilket flow en transaktion hører til ud fra dens tags. Returnerer
 * null ved ukendt/manglende tag → kalderen foretager ingen tilstandsændring
 * (fail-closed).
 */
export function routeByTag(tags: string[] | undefined | null): VivaFlow | null {
  const first = Array.isArray(tags) ? tags[0] : undefined;
  if (first === "billet" || first === "genbestil" || first === "bordbestilling") {
    return first;
  }
  return null;
}

/** Læser bookingId (tags[1]) for billet-/genbestillingsflows. */
export function bookingIdFromTags(tags: string[] | undefined | null): string | null {
  const id = Array.isArray(tags) ? tags[1] : undefined;
  return typeof id === "string" && id.length > 0 ? id : null;
}
