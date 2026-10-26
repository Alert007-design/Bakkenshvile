// Bookingnumre, der ikke kan gættes.
//
// Tidligere var bookingnummeret de sidste 8 cifre i klokkeslættet
// (BH-31608747), så nabonumre kunne regnes ud. Sammen med gæstens mail giver
// nummeret adgang til /genbestil, og derfor skal det være tilfældigt.
//
// 8 tegn fra et alfabet på 31 tegn giver ca. 850 milliarder muligheder. Tegn,
// der kan forveksles, når gæsten taster nummeret af (0/O og 1/I/L), er udeladt.

import { randomInt } from "crypto";

export const BOOKING_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LAENGDE = 8;

/** Nyt, tilfældigt bookingnummer, fx BH-K7M2Q9XR (eller BH-FRI-… for fribilletter). */
export function generateBookingNo(prefix: string = "BH-"): string {
  let tegn = "";
  for (let i = 0; i < LAENGDE; i++) {
    tegn += BOOKING_ALPHABET[randomInt(BOOKING_ALPHABET.length)];
  }
  return prefix + tegn;
}

/** Ensretter et indtastet bookingnummer: uden mellemrum og med store bogstaver. */
export function normalizeBookingNo(input: string | undefined | null): string {
  return String(input ?? "").trim().toUpperCase();
}
