// Ét centralt sted for sitets faktuelle stamdata: navn, adresse, kontakt,
// sæson, jubilæum og besætning. Forside, undersider, structured data og
// metadata læser ALLE herfra, så et sæsonskifte (fx "Sangerinderne 2027" →
// "Sangerinderne 2028") kun kræver én rettelse.
//
// REGEL: Kun verificerede oplysninger må stå her. Mangler en oplysning, står
// feltet tomt/null med en TODO-kommentar — den må ALDRIG udfyldes med et gæt.

import { COMPANY } from "@/lib/legal-content";
import { billeder, type BilledeNoegle } from "@/lib/billeder";

export const SITE_NAME = "Bakkens Hvile";

/** Kort, citerbart svar på "Hvad er Bakkens Hvile?" — bruges som fælles
 *  beskrivelse i metadata og structured data. Alle elementer er verificeret
 *  i projektets eksisterende indhold. */
export const SITE_DESCRIPTION =
  "Bakkens Hvile er scenen for bakkesangerinderne på Dyrehavsbakken i Klampenborg nord for København. Siden 1877 har huset budt på levende skønsang og syngende samfundssatire — klassiske danske sange, viser og dagens friskeste satire, serveret ved dækkede borde i salen.";

/** Traditionen for bakkesangen går tilbage til 1877 (verificeret i husets
 *  eget materiale og brugt gennemgående på sitet). */
export const FOUNDING_YEAR = 1877;

/** 150-års jubilæet: 1877 + 150 = 2027. */
export const ANNIVERSARY_YEAR = 2027;

/** Sæsonetiket til overskrifter som "Sangerinderne 2027". Opdateres her ved
 *  sæsonskifte — aldrig hårdkodet i siderne. */
export const CURRENT_SEASON_LABEL = "2027";

/** Spilleperioden omtales i husets eget materiale som "sommermånederne".
 *  Konkrete datoer og tider kommer altid fra Airtable (lib/events.ts). */
export const SEASON_PERIOD_TEXT = "sommermånederne";

// Adresse — samme kilde som de juridiske sider (lib/legal-content.ts), men
// struktureret til schema.org PostalAddress.
export const ADDRESS = {
  streetAddress: "Dyrehavsbakken 38",
  postalCode: "2930",
  addressLocality: "Klampenborg",
  addressCountry: "DK",
} as const;

export const CONTACT = {
  email: COMPANY.email,
  // TODO(redaktion): Telefonnummer mangler — udfyld i lib/legal-content.ts
  // (COMPANY.phone), så vises det automatisk her og i structured data.
  phone: COMPANY.phone,
  cvr: COMPANY.cvr,
} as const;

export const SOCIAL_PROFILES = [
  "https://www.instagram.com/bakkenshvile/",
  "https://www.facebook.com/bakkenshvile",
] as const;

// TODO(redaktion): Google Business Profile / Google Maps-link mangler i
// projektet. Indsæt det officielle Maps-link her, når det foreligger — det
// bruges så automatisk på /praktisk og i LocalBusiness-data. Opfind ikke et.
export const GOOGLE_MAPS_URL: string | null = null;

// TODO(redaktion): Showets varighed er ikke dokumenteret i projektet.
// Angiv fx "ca. 2 timer", når den er bekræftet — bruges på /praktisk.
export const SHOW_DURATION_TEXT: string | null = null;

/** Sæsonens besætning — navne og portrætter er verificeret i projektet
 *  (forsiden + lib/billeder.ts). Rollebetegnelsen "bakkesangerinde" bruges
 *  gennemgående i husets eget materiale.
 *  TODO(redaktion): Korte biografier pr. sangerinde mangler — tilføj `bio`,
 *  når faktatjekket tekst foreligger (bruges på /sangerinderne). */
export type Performer = {
  name: string;
  rolle: string;
  billedeKey: BilledeNoegle;
  bio?: string;
};

export const PERFORMERS: Performer[] = [
  { name: "Tina Grunwald", rolle: "Bakkesangerinde", billedeKey: "tinaGrunwald" },
  { name: "Sus Mathiasen", rolle: "Bakkesangerinde", billedeKey: "susMathiasen" },
  { name: "Dot Wessman", rolle: "Bakkesangerinde", billedeKey: "dotWessman" },
  { name: "Ann Farholt", rolle: "Bakkesangerinde", billedeKey: "annFarholt" },
];

export const KAPELMESTER: Performer = {
  name: "Kenneth Sichlau",
  rolle: "Kapelmester",
  billedeKey: "kennethMedSyngepigerne",
};

/** Delebillede til Open Graph m.m. — et scenefoto med korrekt alt-tekst og
 *  faktiske mål (fra lib/billeder.ts), så billede og beskrivelse stemmer. */
export const OG_BILLEDE = billeder.blomstersangen;
