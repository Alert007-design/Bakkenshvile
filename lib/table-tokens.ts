// QR-token til bordbestilling.
//
// Hvert bord har en kryptografisk token, der bindes til BÅDE bordnummeret og en
// tokenversion (sæson). Tokenet er en HMAC-SHA256 over "version:bordnummer" med
// den server-only hemmelighed TABLE_QR_SECRET, kodet som base64url (43 tegn —
// langt over minimumskravet på 16). Det kan ikke gættes eller udledes uden
// hemmeligheden, og et token for ét bord kan ikke genbruges på et andet.
//
// Rotation: hæv TABLE_TOKEN_VERSION (eller sæt env-variablen) og generér nye
// QR-ark. Gamle tokens holder op med at validere, uden at resten af systemet
// skal ændres.
//
// Tokenet giver i sig selv IKKE ret til at bestille — serveren kræver desuden
// et aktivt event i åben bestillingsperiode. Et fotograferet skilt kan derfor
// ikke bruges hjemmefra på et vilkårligt tidspunkt.

import { createHmac, timingSafeEqual } from "crypto";
import { isValidTableNumber } from "@/lib/tables";

// Aktuel tokenversion/sæson. Kan overstyres med env, så rotation ikke kræver
// en kodeændring.
export const TABLE_TOKEN_VERSION = process.env.TABLE_TOKEN_VERSION || "2026";

// Minimumslængde for et token i tegn (spec-krav). Base64url af en SHA-256 er
// altid 43 tegn, men vi bevogter kravet eksplicit ved verifikation.
export const MIN_TOKEN_LENGTH = 16;

function secret(): string {
  const s = process.env.TABLE_QR_SECRET;
  if (!s) throw new Error("TABLE_QR_SECRET mangler i miljøvariablerne");
  return s;
}

/**
 * Genererer QR-tokenet for et bord i en given tokenversion. Kaster hvis bordet
 * ikke findes, så et ugyldigt bordnummer aldrig kan få et token.
 */
export function tableToken(
  number: number,
  version: string = TABLE_TOKEN_VERSION
): string {
  if (!isValidTableNumber(number)) {
    throw new Error(`Ugyldigt bordnummer: ${number}`);
  }
  return createHmac("sha256", secret())
    .update(`${version}:${number}`)
    .digest("base64url");
}

/**
 * Verificerer et token mod et bordnummer med timing-safe sammenligning.
 * Returnerer false — aldrig en exception — ved ethvert ugyldigt input, så
 * kalderen kan svare med den samme generiske fejl uanset årsag.
 */
export function verifyTableToken(
  number: unknown,
  token: unknown,
  version: string = TABLE_TOKEN_VERSION
): boolean {
  if (!isValidTableNumber(number)) return false;
  if (typeof token !== "string" || token.length < MIN_TOKEN_LENGTH) return false;

  let expected: string;
  try {
    expected = tableToken(number, version);
  } catch {
    return false;
  }

  const given = Buffer.from(token);
  const want = Buffer.from(expected);
  // Længdetjek før timingSafeEqual (som kaster ved forskellig længde). Selve
  // sammenligningen er stadig konstant-tid for tokens af korrekt længde.
  if (given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}

/**
 * Bygger den fulde QR-URL for et bord, fx
 * https://bakkenshvile.dk/bord/63?k=<token>
 */
export function tableUrl(
  number: number,
  baseUrl: string,
  version: string = TABLE_TOKEN_VERSION
): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/bord/${number}?k=${tableToken(number, version)}`;
}
