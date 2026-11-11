// Personalets noter på en booking (fra /admin/opslag).
//
// Noten lægges bagerst i feltet "Særlige ønsker" efter de tekster, der står i
// forvejen, adskilt med " | " som systemets øvrige noter. Så vises den både
// under "Bemærkning" på opslaget og på gæstelisten, uden et nyt felt i
// Airtable. Kunden får ingen besked.

import { FIELDS } from "@/lib/airtable";
import { tilfoejNote } from "@/lib/annuller-booking";

export const NOTE_MAKS = 300;

/** Én linje uden linjeskift og uden " | ", som ellers ville dele noten i to. */
export function rensNote(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/\s+/g, " ").replace(/\|/g, "/").trim();
}

const FORMAT = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "Note 11-11-2026 kl. 19.40: Rullestol" i dansk tid. */
export function personaleNoteLinje(note: string, nu: Date): string {
  const d: Record<string, string> = {};
  for (const p of FORMAT.formatToParts(nu)) d[p.type] = p.value;
  return `Note ${d.day}-${d.month}-${d.year} kl. ${d.hour}.${d.minute}: ${note}`;
}

export interface NoteDeps {
  hentBooking(id: string): Promise<{ id: string; fields: Record<string, unknown> } | null>;
  opdaterBooking(id: string, felter: Record<string, unknown>): Promise<void>;
  nu(): Date;
  log(besked: string, ctx?: Record<string, unknown>): void;
}

export type NoteSvar =
  | { ok: true; saerligeOensker: string }
  | { ok: false; status: number; error: string };

export async function tilfoejPersonalenote(
  deps: NoteDeps,
  bookingId: string,
  input: unknown
): Promise<NoteSvar> {
  const note = rensNote(input);
  if (!note) return { ok: false, status: 400, error: "Skriv en note først." };
  if (note.length > NOTE_MAKS) {
    return { ok: false, status: 400, error: `Noten må højst være ${NOTE_MAKS} tegn.` };
  }

  const booking = await deps.hentBooking(bookingId);
  if (!booking) return { ok: false, status: 404, error: "Bookingen findes ikke." };

  const nyTekst = tilfoejNote(
    String(booking.fields[FIELDS.booking.specialRequests] ?? ""),
    personaleNoteLinje(note, deps.nu())
  );
  try {
    await deps.opdaterBooking(bookingId, { [FIELDS.booking.specialRequests]: nyTekst });
  } catch {
    deps.log("Note: Airtable kunne ikke opdateres", { bookingId });
    return {
      ok: false,
      status: 502,
      error: "Noten blev ikke gemt, fordi Airtable ikke svarede. Prøv igen om lidt.",
    };
  }
  return { ok: true, saerligeOensker: nyTekst };
}
