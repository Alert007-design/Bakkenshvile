// Opslag på et bookingnummer i admin: alt om bookingen og kunden samlet.
// Ren regnefil; selve hentningen sker i app/api/admin/bookingopslag.

import { FIELDS, type AirtableRecord } from "@/lib/airtable";
import { normalizeBookingNo } from "@/lib/booking-no";
import { delPaaKategorier, kundeBemaerkning, manglerBetaling, type Kategoridel } from "@/lib/gaesteliste";

/**
 * Ensretter et indtastet bookingnummer og afviser alt andet end bogstaver,
 * tal og bindestreg. Det beskytter søgningen i Airtable mod formel-injektion.
 */
export function gyldigtOpslagsnummer(input: string | undefined | null): string | null {
  const nr = normalizeBookingNo(input);
  if (!/^[A-Z0-9-]{1,40}$/.test(nr)) return null;
  return nr;
}

export interface Forestillingsinfo {
  title: string;
  date: string;
  time: string;
}

export interface Opslag {
  id: string;
  bookingNo: string;
  gaestenummer: number | null;
  status: string;
  bestilt: string;
  antal: number;
  billetter: Kategoridel[];
  bord: string;
  tilvalg: string;
  onlinerabat: number | null;
  betaltIAlt: number | null;
  /** Beløb, der mangler fra det gamle system; null når intet mangler. */
  manglerBetaling: number | null;
  /** Kundens egen bemærkning uden systemtekster. */
  bemaerkning: string;
  /** Feltet "Særlige ønsker" præcis som det står. */
  saerligeOenskerRaa: string;
  varselSendt: boolean;
  /** Sidste betalingsfrist for store selskaber (ÅÅÅÅ-MM-DD), ellers tom. */
  betalingsfrist: string;
  match: {
    vilMatches: boolean;
    alder: string;
    fra: string;
    drik: string;
    interesser: string;
    note: string;
  };
  kunde: {
    navn: string;
    firma: string;
    adresse: string;
    postnr: string;
    by: string;
    telefon: string;
    email: string;
  };
  forestilling: Forestillingsinfo | null;
}

function tekst(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "name" in (v as object)) {
    return String((v as { name?: unknown }).name ?? "");
  }
  return String(v);
}

function tal(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function bygOpslag(
  booking: AirtableRecord,
  kunde: AirtableRecord | null,
  forestilling: Forestillingsinfo | null
): Opslag {
  const f = booking.fields;
  const k = kunde?.fields ?? {};
  const antal = tal(f[FIELDS.booking.ticketCount]) ?? 0;
  const raa = tekst(f[FIELDS.booking.specialRequests]);
  const bestiltFelt = tekst(f[FIELDS.booking.bestilt]);
  return {
    id: booking.id,
    bookingNo: tekst(f[FIELDS.booking.bookingNo]),
    gaestenummer: tal(f[FIELDS.booking.gaestenummer]),
    status: tekst(f[FIELDS.booking.status]),
    bestilt: bestiltFelt || booking.createdTime || "",
    antal,
    billetter: delPaaKategorier(tekst(f[FIELDS.booking.ticketBreakdown]), antal),
    bord: tekst(f[FIELDS.booking.tableNumber]),
    tilvalg: tekst(f[FIELDS.booking.addons]),
    onlinerabat: tal(f[FIELDS.booking.discount]),
    betaltIAlt: tal(f[FIELDS.booking.totalPaid]),
    manglerBetaling: manglerBetaling(raa, tal(f[FIELDS.booking.totalPaid])),
    bemaerkning: kundeBemaerkning(raa),
    saerligeOenskerRaa: raa,
    varselSendt: Boolean(f[FIELDS.booking.varselSent]),
    betalingsfrist: tekst(f[FIELDS.booking.betalingsfrist]),
    match: {
      vilMatches: Boolean(f[FIELDS.booking.wantsMatching]),
      alder: tekst(f[FIELDS.booking.ageGroup]),
      fra: tekst(f[FIELDS.booking.location]),
      drik: tekst(f[FIELDS.booking.drinkPreference]),
      interesser: tekst(f[FIELDS.booking.interests]),
      note: tekst(f[FIELDS.booking.matchNote]),
    },
    kunde: {
      navn: tekst(k[FIELDS.customer.name]),
      firma: tekst(k[FIELDS.customer.company]),
      adresse: tekst(k[FIELDS.customer.address]),
      postnr: tekst(k[FIELDS.customer.zip]),
      by: tekst(k[FIELDS.customer.city]),
      telefon: tekst(k[FIELDS.customer.phone]),
      email: tekst(k[FIELDS.customer.email]),
    },
    forestilling,
  };
}
