// Advarsel om dobbeltbooking lige før betaling (/api/checkout).
//
// Reglen: findes der en BETALT billetbooking inden for den seneste time med
// samme e-mail (uden hensyn til store/små bogstaver og mellemrum), samme
// forestilling og samme antal gæster, advares kunden, før hun sendes til Viva.
//
// Advarslen må ALDRIG blokere et køb. Fejler opslaget, svares "ingen advarsel",
// og fejlen logges uden e-mail og navne. Svaret er kun ja/nej: der gives aldrig
// oplysninger om den første booking videre.
//
// Opslaget bruger den eksisterende betalingstabel (ticket_payments), som har
// e-mail og betalingstidspunkt. Forestilling, antal og status læses fra selve
// bookingen i Airtable, men kun for de få bookinger, der matcher e-mailen i
// den seneste time.

import { FIELDS } from "@/lib/airtable";
import { erAnnulleret } from "@/lib/annuller-booking";
import type { Queryable } from "@/lib/db";

export const VINDUE_MINUTTER = 60;

/** Små bogstaver og ingen mellemrum, så skrivemåden ikke betyder noget. */
export function normaliserEmail(email: string | null | undefined): string {
  return String(email ?? "").toLowerCase().replace(/\s+/g, "");
}

/**
 * Booking-id'er med en betalt billetbetaling siden `fra` og samme e-mail.
 * Genbestilling af drikkevarer (flow 'genbestil') tæller ikke med.
 */
export async function hentBetalteBookingIds(
  db: Queryable,
  emailNormaliseret: string,
  fra: Date
): Promise<string[]> {
  const { rows } = await db.query<{ booking_id: string }>(
    `SELECT DISTINCT booking_id
       FROM ticket_payments
      WHERE status = 'paid'
        AND flow = 'billet'
        AND paid_at >= $2
        AND lower(regexp_replace(coalesce(customer_email, ''), '\\s', '', 'g')) = $1`,
    [emailNormaliseret, fra.toISOString()]
  );
  return rows.map((r) => r.booking_id);
}

export interface DobbeltDeps {
  hentBetalteBookingIds(emailNormaliseret: string, fra: Date): Promise<string[]>;
  hentBooking(id: string): Promise<{ id: string; fields: Record<string, unknown> } | null>;
  nu(): Date;
  log(besked: string, ctx?: Record<string, unknown>): void;
}

export interface DobbeltInput {
  email?: string | null;
  showId: string;
  antal: number;
}

/**
 * true = vis advarslen. Kaster aldrig: ved enhver fejl er svaret false.
 */
export async function tjekDobbeltbooking(deps: DobbeltDeps, input: DobbeltInput): Promise<boolean> {
  const email = normaliserEmail(input.email);
  if (!email) return false;
  try {
    const fra = new Date(deps.nu().getTime() - VINDUE_MINUTTER * 60_000);
    const ids = await deps.hentBetalteBookingIds(email, fra);
    for (const id of ids) {
      const booking = await deps.hentBooking(id);
      if (!booking) continue;
      const f = booking.fields;
      const status = f[FIELDS.booking.status];
      if (erAnnulleret(status) || String(status ?? "") !== "Betalt") continue;
      const shows = f[FIELDS.booking.show];
      if (!Array.isArray(shows) || !shows.includes(input.showId)) continue;
      if (Number(f[FIELDS.booking.ticketCount]) !== input.antal) continue;
      return true;
    }
    return false;
  } catch {
    deps.log("Dobbeltbooking-tjek fejlede, kunden sendes videre til betaling");
    return false;
  }
}
