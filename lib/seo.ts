// Fælles SEO-værktøjer: sideregister med unikke titler/beskrivelser,
// metadata-bygger (title, description, canonical, Open Graph, Twitter) og
// JSON-LD-byggere (schema.org).
//
// REGLER (håndhæves også af lib/seo.test.ts):
// - Alle indekserbare sider står i PAGES med unik titel + beskrivelse + sti.
// - Structured data bygges KUN af data, der også vises synligt på siderne
//   (site-config, Airtable-events) — aldrig opfundne priser, datoer eller
//   anmeldelser.

import type { Metadata } from "next";
import { siteUrl } from "@/lib/site-url";
import type { ShowDate } from "@/lib/events";
import {
  SITE_NAME,
  SITE_DESCRIPTION,
  FOUNDING_YEAR,
  ANNIVERSARY_YEAR,
  CURRENT_SEASON_LABEL,
  ADDRESS,
  CONTACT,
  SOCIAL_PROFILES,
  PERFORMERS,
  KAPELMESTER,
  OG_BILLEDE,
} from "@/lib/site-config";
import { billeder } from "@/lib/billeder";

/** Registret over alle indekserbare, offentlige sider. Sitemap, canonicals og
 *  tests læser herfra — én kilde, ingen glemte sider. */
export const PAGES = {
  forside: {
    path: "/",
    title: `${SITE_NAME} — Skønsang & samfundssatire på Dyrehavsbakken`,
    description: SITE_DESCRIPTION,
  },
  billetter: {
    path: "/book",
    title: `Køb billetter — ${SITE_NAME} ${CURRENT_SEASON_LABEL}`,
    description:
      "Se spilledatoer og køb billetter til Bakkens Hvile på Dyrehavsbakken. Vælg forestilling, billetter og tilvalg, og betal sikkert online. Bestil drikkevarer online med 10 % rabat inden kl. 12.00 på forestillingsdagen.",
  },
  priser: {
    path: "/priser",
    title: `Drikkekort & priser — ${SITE_NAME}`,
    description:
      "Se hele drikkekortet i Bakkens Hvile: øl, vin, drinks, spiritus og snacks. Bestil online sammen med billetten senest kl. 12.00 på forestillingsdagen og få 10 % rabat.",
  },
  sangerinderne: {
    path: "/sangerinderne",
    title: `Bakkesangerinderne ${CURRENT_SEASON_LABEL} — mød sangerinderne i ${SITE_NAME}`,
    description: `Mød sæsonens bakkesangerinder i Bakkens Hvile: ${PERFORMERS.map((p) => p.name).join(", ")} — og kapelmester ${KAPELMESTER.name}. Skønsang og syngende samfundssatire på Dyrehavsbakken siden ${FOUNDING_YEAR}.`,
  },
  historie: {
    path: "/historie",
    title: `${SITE_NAME}s historie — bakkesangerinder siden ${FOUNDING_YEAR}`,
    description: `Traditionen for bakkesangen går tilbage til ${FOUNDING_YEAR}. Læs om Bakkens Hvile på Dyrehavsbakken: huset, scenen og bakkesangerinderne — snart 150 år med skønsang og syngende samfundssatire.`,
  },
  jubilaeum: {
    path: "/150-aar",
    title: `${SITE_NAME} 150 år — jubilæum ${ANNIVERSARY_YEAR}`,
    description: `I ${ANNIVERSARY_YEAR} fejrer Bakkens Hvile 150 år med bakkesang på Dyrehavsbakken (${FOUNDING_YEAR}–${ANNIVERSARY_YEAR}). Læs om jubilæet, historien og billetter til jubilæumssæsonen.`,
  },
  fest: {
    path: "/underholdning-til-fest",
    title: `Underholdning til fest — book bakkesangerinderne`,
    description:
      "Book bakkesangerinderne fra Bakkens Hvile til jeres arrangement: levende sang og feststemning med et musikalsk indslag, der overrasker og glæder gæsterne. Send en uforpligtende forespørgsel og hør om pris.",
  },
  showKoebenhavn: {
    path: "/show-koebenhavn",
    title: `Show i København? Oplev ${SITE_NAME} på Dyrehavsbakken`,
    description:
      "Leder du efter et show eller live underholdning i København? Bakkens Hvile på Dyrehavsbakken i Klampenborg, nord for København, byder på levende sang, musik og satire tæt på publikum — en anderledes aften ud over det sædvanlige.",
  },
  praktisk: {
    path: "/praktisk",
    title: `Praktisk information & FAQ — ${SITE_NAME}`,
    description:
      "Svar på de mest stillede spørgsmål om Bakkens Hvile: adresse og find vej, billetkøb, spilledatoer, drikkevarer ved bordet og booking af bakkesangerinderne.",
  },
  english: {
    path: "/en",
    title: `Live show at Bakken near Copenhagen — ${SITE_NAME}`,
    description:
      "Bakkens Hvile is a historic stage at Dyrehavsbakken (Bakken) in Klampenborg, north of Copenhagen, where the Bakkesangerinder have performed live songs and satirical entertainment since 1877.",
  },
  handelsbetingelser: {
    path: "/handelsbetingelser",
    title: `Handelsbetingelser — ${SITE_NAME}`,
    description:
      "Handelsbetingelser for køb af billetter og tilvalg i Bakkens Hvile.",
  },
  privatlivspolitik: {
    path: "/privatlivspolitik",
    title: `Privatlivspolitik — ${SITE_NAME}`,
    description:
      "Sådan behandler Bakkens Hvile dine personoplysninger, når du køber billetter.",
  },
} as const;

export type PageKey = keyof typeof PAGES;

function absolute(path: string): string {
  return `${siteUrl()}${path === "/" ? "" : path}` + (path === "/" ? "/" : "");
}

/** Bygger komplet Next-metadata for en side i registret: unik titel og
 *  beskrivelse, canonical, Open Graph og Twitter-kort. */
export function pageMetadata(key: PageKey, extra: Partial<Metadata> = {}): Metadata {
  const page = PAGES[key];
  const url = absolute(page.path);
  const locale = key === "english" ? "en" : "da_DK";
  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: page.path,
      ...(key === "forside" || key === "english"
        ? { languages: { "da-DK": "/", en: "/en" } }
        : {}),
    },
    openGraph: {
      title: page.title,
      description: page.description,
      url,
      siteName: SITE_NAME,
      locale,
      type: "website",
      images: [
        {
          url: `${siteUrl()}${encodeURI(OG_BILLEDE.src)}`,
          width: OG_BILLEDE.bredde,
          height: OG_BILLEDE.hoejde,
          alt: OG_BILLEDE.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [`${siteUrl()}${encodeURI(OG_BILLEDE.src)}`],
    },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// JSON-LD (schema.org)
// ---------------------------------------------------------------------------

const ORG_ID = () => `${siteUrl()}/#organization`;
const VENUE_ID = () => `${siteUrl()}/#venue`;
const WEBSITE_ID = () => `${siteUrl()}/#website`;

function postalAddress() {
  return {
    "@type": "PostalAddress",
    streetAddress: ADDRESS.streetAddress,
    postalCode: ADDRESS.postalCode,
    addressLocality: ADDRESS.addressLocality,
    addressCountry: ADDRESS.addressCountry,
  };
}

/** Organisation + spillested + websted som samlet @graph (forsiden).
 *  Alle felter afspejler synligt indhold: adresse og CVR står i footeren,
 *  grundlæggelsesåret i brødteksten, profilerne under Kontakt. */
export function organizationGraph() {
  const site = siteUrl();
  const image = `${site}${encodeURI(OG_BILLEDE.src)}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID(),
        name: SITE_NAME,
        url: `${site}/`,
        email: CONTACT.email,
        taxID: CONTACT.cvr,
        foundingDate: String(FOUNDING_YEAR),
        description: SITE_DESCRIPTION,
        image,
        logo: image,
        address: postalAddress(),
        sameAs: [...SOCIAL_PROFILES],
      },
      {
        "@type": "PerformingArtsTheater",
        "@id": VENUE_ID(),
        name: SITE_NAME,
        url: `${site}/`,
        image,
        address: postalAddress(),
        parentOrganization: { "@id": ORG_ID() },
        // TODO(redaktion): geo-koordinater og åbningstider tilføjes, når de
        // foreligger verificeret — de opfindes ikke.
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID(),
        name: SITE_NAME,
        url: `${site}/`,
        inLanguage: "da-DK",
        publisher: { "@id": ORG_ID() },
      },
    ],
  };
}

/** BreadcrumbList ud fra [navn, sti]-par. */
export function breadcrumbs(items: Array<[string, string]>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: absolute(path),
    })),
  };
}

/** Event-data for kommende forestillinger — bygget af PRÆCIS samme datakilde
 *  (lib/events.ts) som den synlige datovælger på /book, så synligt indhold og
 *  structured data aldrig kan være uenige. Priser medtages ikke, da de afhænger
 *  af billettype og altid beregnes serverside; offers peger på billetkøbet, og
 *  availability afspejler eventets udsolgt-flag. */
export function eventsJsonLd(shows: ShowDate[]) {
  const site = siteUrl();
  const bookUrl = `${site}/book`;
  return shows
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date))
    .map((s) => ({
      "@context": "https://schema.org",
      "@type": "Event",
      name: s.title,
      description: SITE_DESCRIPTION,
      image: `${site}${encodeURI(OG_BILLEDE.src)}`,
      // Dansk lokal tid; uden klokkeslæt bruges ren dato.
      startDate: /^\d{2}:\d{2}$/.test(s.time) ? `${s.date}T${s.time}:00` : s.date,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "PerformingArtsTheater",
        "@id": VENUE_ID(),
        name: SITE_NAME,
        address: postalAddress(),
      },
      performer: {
        "@type": "PerformingGroup",
        name: "Bakkesangerinderne",
      },
      organizer: { "@type": "Organization", "@id": ORG_ID(), name: SITE_NAME },
      offers: {
        "@type": "Offer",
        url: bookUrl,
        availability: s.soldOut
          ? "https://schema.org/SoldOut"
          : "https://schema.org/InStock",
      },
      url: bookUrl,
    }));
}

/** Person-data for sæsonens besætning (til /sangerinderne). Kun navn, rolle og
 *  portræt — præcis det, siden viser. */
export function performersJsonLd() {
  const site = siteUrl();
  const alle = [...PERFORMERS, KAPELMESTER];
  return {
    "@context": "https://schema.org",
    "@type": "PerformingGroup",
    name: "Bakkesangerinderne",
    url: `${site}/sangerinderne`,
    memberOf: { "@id": ORG_ID() },
    member: alle.map((p) => ({
      "@type": "Person",
      name: p.name,
      jobTitle: p.rolle,
      image: `${site}${encodeURI(billeder[p.billedeKey].src)}`,
      worksFor: { "@id": ORG_ID() },
    })),
  };
}

/** FAQPage-data — må KUN kaldes med spørgsmål/svar, der står synligt på siden. */
export function faqJsonLd(items: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}
