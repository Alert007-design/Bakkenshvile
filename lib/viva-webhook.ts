// Dirigering af Vivas fælles webhook. Viva sender ALLE transaktioner på kontoen
// til det samme endpoint, så vi router på transaktionens FØRSTE tag (som vi selv
// satte ved oprettelsen og læser tilbage fra den verificerede transaktion —
// aldrig fra webhook-payloaden).

export type VivaFlow = "billet" | "genbestil" | "bordbestilling";

/**
 * Bestemmer hvilket flow en transaktion hører til ud fra dens tags. Returnerer
 * null ved ukendt/manglende tag → kalderen foretager ingen tilstandsændring
 * (fail-closed).
 *
 * Bemærk: Viva returnerer ikke altid de tags, vi satte på ordren, tilbage på
 * den hentede transaktion (demo returnerer fx en tom liste). Webhooken kan
 * derfor ikke stole på tags alene og dirigerer primært på vores egen reference
 * (orderCode) mod billet-ledgeren; denne funktion bevares som et hurtigt hint,
 * når tags rent faktisk er til stede.
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
