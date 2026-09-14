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

/** Showets varighed — bekræftet af Bakkens Hvile 14. sep. 2026. Bruges på
 *  /praktisk. */
export const SHOW_DURATION_TEXT: string | null = "ca. 2½ time inkl. pause";

/** Sæsonens besætning — navne og portrætter er verificeret i projektet
 *  (forsiden + lib/billeder.ts). Rollebetegnelsen "bakkesangerinde" bruges
 *  gennemgående i husets eget materiale.
 *
 *  `bio`: kort biografi, vises på /sangerinderne.
 *  `bioDraft: true`: teksten er et UDKAST, afledt af interview-uddrag fra det
 *    gamle site — endnu ikke faktatjekket. Vises med et synligt "Udkast"-mærke,
 *    og skal godkendes/omskrives af Bakkens Hvile, før mærket fjernes.
 *  Dot Wessman og Kenneth Sichlau er bekræftede fakta (ikke udkast). */
export type Performer = {
  name: string;
  rolle: string;
  billedeKey: BilledeNoegle;
  bio?: string;
  bioDraft?: boolean;
};

export const PERFORMERS: Performer[] = [
  {
    name: "Tina Grunwald",
    rolle: "Bakkesangerinde",
    billedeKey: "tinaGrunwald",
    bio: "Tina Grunwald er en af husets mest rutinerede og beskriver sig selv som den ældste nulevende bakkesangerinde.",
    bioDraft: true,
  },
  {
    name: "Sus Mathiasen",
    rolle: "Bakkesangerinde",
    billedeKey: "susMathiasen",
    bio: "Sus Mathiasen var lige ved at takke nej til rollen, men sagde ja — og er nu i sin tredje sæson. Hun beskriver sin stil som lidt skæv, med et blink i øjet.",
    bioDraft: true,
  },
  {
    name: "Dot Wessman",
    rolle: "Bakkesangerinde",
    billedeKey: "dotWessman",
    bio: "Dot Wessman overtog Bakkens Hvile fra sin mor, Lilian Matzen, der selv havde overtaget stedet fra sin far. I 2026 har Dot 50 års jubilæum og har lagt en ære og et liv i at sikre stedets overlevelse. Ud over Hvilen er hun teltholder på Bakken og driver som fjerde generation af Stefansens Forlystelser en række forskellige forretninger.",
  },
  {
    name: "Ann Farholt",
    rolle: "Bakkesangerinde",
    billedeKey: "annFarholt",
    bio: "Ann Farholt tager altid sig selv og sit levede liv med på scenen. Hun fremhæver balancen i satiren — hurtig på aftrækkeren, men med sans for, hvornår det bliver for meget — og kalder bakkesangen tidløs.",
    bioDraft: true,
  },
];

export const KAPELMESTER: Performer = {
  name: "Kenneth Sichlau",
  rolle: "Kapelmester",
  billedeKey: "kennethMedSyngepigerne",
  bio: "Kenneth Sichlau er komponist, tekstforfatter og pianist og til daglig skolelærer. Han har været i Bakkens Hvile i over 25 år og er en integreret del af forestillingen — han skaber showene op til sæsonen og sidder ved klaveret under dem.",
};

/** Delebillede til Open Graph m.m. — et scenefoto med korrekt alt-tekst og
 *  faktiske mål (fra lib/billeder.ts), så billede og beskrivelse stemmer. */
export const OG_BILLEDE = billeder.blomstersangen;
