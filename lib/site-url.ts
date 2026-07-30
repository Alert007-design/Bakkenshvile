// Sitets kanoniske basis-URL — ENESTE kilde til absolutte URL'er (QR-koder,
// mail-links, cron). Et domæneskift kræver derfor kun, at miljøvariablen
// SITE_URL ændres ét sted.
//
// Sitet ligger indtil videre på Vercel-domænet. Når bakkenshvile.dk peger
// korrekt hertil, sættes SITE_URL blot til "https://bakkenshvile.dk".
// VIGTIGT: SITE_URL må ikke pege på det gamle site (www.bakkenshvile.dk), da
// QR-koderne så peger forkert.
export const DEFAULT_SITE_URL = "https://bakkenshvile.vercel.app";

/** Returnerer sitets basis-URL uden efterstillede skråstreger. */
export function siteUrl(): string {
  return (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}
