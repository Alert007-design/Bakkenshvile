// Placering af gamle bookinger i de fire priskategorier.
//
// Bookinger fra før dette system har ingen kobling til billettypen. Det eneste,
// de har, er feltet med billetnedbrydningen — fx "A+ (1.-2.-3. række) x2, B
// (10. række) x1" — som koden selv skrev ved købet (lib/ticket-checkout.ts).
//
// Teksten bliver IKKE tolket. Kategorinavnet slås op tegn for tegn i listen af
// billettyper, og kapacitetskategorien hentes fra DEN billettype. Giver
// opslaget ikke ét entydigt svar, placeres bookingen ikke — den havner på en
// liste, ejeren selv tager stilling til. Intet springes stille over.
//
// Fremadrettet er det her overflødigt: nye reservationer gemmer billettypens
// id direkte i pladsbogen.

import {
  kategoriFraAirtable,
  type Kapacitetskategori,
} from "@/lib/kapacitet";

/** En billettype, som opslaget kan ramme. */
export interface OpslagsBillettype {
  id: string;
  category: string;
  kapacitetskategori: Kapacitetskategori | null;
}

/** Én post i billetnedbrydningen: kategorinavnet og antallet. */
export interface Nedbrydningsdel {
  kategorinavn: string;
  antal: number;
}

export type Placeringsfejl =
  | "ukendt-kategorinavn"
  | "billettype-uden-kapacitetskategori"
  | "flere-modstridende-billettyper"
  | "ulaeselig-nedbrydning";

export const FEJLTEKST: Record<Placeringsfejl, string> = {
  "ukendt-kategorinavn":
    "Kategorinavnet findes ikke blandt billettyperne (omdøbt eller slettet).",
  "billettype-uden-kapacitetskategori":
    "Billettypen mangler kapacitetskategori i Airtable.",
  "flere-modstridende-billettyper":
    "Flere billettyper har samme navn, men peger på hver sin kapacitetskategori.",
  "ulaeselig-nedbrydning":
    "Billetfordelingen på bookingen kan ikke læses.",
};

/**
 * Deler billetnedbrydningen op i "kategorinavn" + antal.
 * Formatet er "<navn> x<antal>", adskilt af komma — præcis som
 * ticketBreakdown bygges ved købet.
 */
export function laesNedbrydning(
  breakdown: string
): { dele: Nedbrydningsdel[]; ulaeselig: boolean } {
  const raa = String(breakdown ?? "").trim();
  if (!raa) return { dele: [], ulaeselig: true };
  const dele: Nedbrydningsdel[] = [];
  let ulaeselig = false;
  for (const stykke of raa.split(",")) {
    const t = stykke.trim();
    if (!t) continue;
    const m = t.match(/^(.+?)\s+x(\d+)$/);
    if (!m) {
      ulaeselig = true;
      continue;
    }
    const antal = Number(m[2]);
    if (!Number.isInteger(antal) || antal <= 0) {
      ulaeselig = true;
      continue;
    }
    dele.push({ kategorinavn: m[1].trim(), antal });
  }
  if (dele.length === 0) ulaeselig = true;
  return { dele, ulaeselig };
}

export type Placering =
  | { ok: true; kategori: Kapacitetskategori; ticketTypeId: string }
  | { ok: false; fejl: Placeringsfejl };

/**
 * Slår ét kategorinavn op blandt billettyperne og finder kapacitetskategorien.
 * Kræver ét entydigt svar: matcher navnet flere billettyper, skal de alle
 * pege på den samme kapacitetskategori, ellers kan bookingen ikke placeres.
 */
export function placerKategorinavn(
  kategorinavn: string,
  billettyper: OpslagsBillettype[]
): Placering {
  const navn = kategorinavn.trim();
  const traef = billettyper.filter((t) => t.category.trim() === navn);
  if (traef.length === 0) return { ok: false, fejl: "ukendt-kategorinavn" };

  const medKategori = traef.filter((t) => t.kapacitetskategori !== null);
  if (medKategori.length === 0) {
    return { ok: false, fejl: "billettype-uden-kapacitetskategori" };
  }
  const unikke = new Set(medKategori.map((t) => t.kapacitetskategori));
  if (unikke.size > 1) {
    return { ok: false, fejl: "flere-modstridende-billettyper" };
  }
  return {
    ok: true,
    kategori: medKategori[0].kapacitetskategori as Kapacitetskategori,
    ticketTypeId: medKategori[0].id,
  };
}

export interface BookingTilImport {
  bookingId: string;
  bookingNo: string;
  showId: string;
  /** Feltet med billetfordelingen, fx "A+ (1.-2.-3. række) x2". */
  ticketBreakdown: string;
  kundenavn: string;
  dato: string;
}

export interface PlaceretBooking {
  booking: BookingTilImport;
  oensker: { kategori: Kapacitetskategori; antal: number; ticketTypeId: string }[];
}

export interface UplaceretBooking {
  booking: BookingTilImport;
  fejl: Placeringsfejl;
  /** Det stykke tekst, det gik galt på — så ejeren kan se hvorfor. */
  detalje: string;
}

/**
 * Deler bookingerne i dem, der kan placeres entydigt, og dem, ejeren selv skal
 * tage stilling til. En booking placeres kun, hvis ALLE dens dele kan placeres
 * — en halv placering ville give forkerte tal.
 */
export function placerBookinger(
  bookinger: BookingTilImport[],
  billettyper: OpslagsBillettype[]
): { placerede: PlaceretBooking[]; uplacerede: UplaceretBooking[] } {
  const placerede: PlaceretBooking[] = [];
  const uplacerede: UplaceretBooking[] = [];

  for (const booking of bookinger) {
    const { dele, ulaeselig } = laesNedbrydning(booking.ticketBreakdown);
    if (ulaeselig) {
      uplacerede.push({
        booking,
        fejl: "ulaeselig-nedbrydning",
        detalje: booking.ticketBreakdown,
      });
      continue;
    }
    const oensker: PlaceretBooking["oensker"] = [];
    let fejlet: UplaceretBooking | null = null;
    for (const del of dele) {
      const p = placerKategorinavn(del.kategorinavn, billettyper);
      if (!p.ok) {
        fejlet = { booking, fejl: p.fejl, detalje: del.kategorinavn };
        break;
      }
      oensker.push({
        kategori: p.kategori,
        antal: del.antal,
        ticketTypeId: p.ticketTypeId,
      });
    }
    if (fejlet) uplacerede.push(fejlet);
    else placerede.push({ booking, oensker });
  }

  return { placerede, uplacerede };
}

/** Oversætter Airtable-feltet på en billettype. Genbruges af importruten. */
export function opslagsBillettype(
  id: string,
  category: unknown,
  kapacitetsfelt: unknown
): OpslagsBillettype {
  return {
    id,
    category: String(category ?? ""),
    kapacitetskategori: kategoriFraAirtable(kapacitetsfelt),
  };
}
