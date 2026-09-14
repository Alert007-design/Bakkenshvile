import Link from "next/link";
import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import JsonLd from "../components/JsonLd";
import {
  ADDRESS,
  CONTACT,
  FOUNDING_YEAR,
  ANNIVERSARY_YEAR,
  PERFORMERS,
  KAPELMESTER,
  GOOGLE_MAPS_URL,
  SHOW_DURATION_TEXT,
} from "@/lib/site-config";
import { pageMetadata, breadcrumbs, faqJsonLd } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("praktisk");

// FAQ-indholdet står synligt på siden, og PRÆCIS samme spørgsmål/svar bruges i
// FAQPage-schemaet (én kilde — ingen skjult crawler-tekst).
//
// TODO(redaktion): Endnu ubekræftet og derfor udeladt: aldersgrænser samt
// gavekort (under opbygning som selvstændigt salgsflow — tilføj et spørgsmål
// her, når siden findes). Varighed, parkering, mad og tilgængelighed er
// bekræftet 14. sep. 2026 og medtaget nedenfor.
const FAQ: Array<{ question: string; answer: string }> = [
  {
    question: "Hvad er Bakkens Hvile?",
    answer: `Bakkens Hvile er scenen for bakkesangerinderne på Dyrehavsbakken i Klampenborg nord for København. Siden ${FOUNDING_YEAR} har huset budt på levende skønsang og syngende samfundssatire — klassiske danske sange, viser og dagens friskeste satire, oplevet ved dækkede borde i salen.`,
  },
  {
    question: "Hvor ligger Bakkens Hvile?",
    answer: `Adressen er ${ADDRESS.streetAddress}, ${ADDRESS.postalCode} ${ADDRESS.addressLocality}. Huset ligger midt på Dyrehavsbakken ved Dyrehavens bøgeskov i Klampenborg, nord for København.`,
  },
  {
    question: "Hvor kan man parkere?",
    answer:
      "Der parkeres via Bakkens parkering ved Dyrehavsbakken, hvorfra du går ind på Bakken til huset.",
  },
  {
    question: "Hvordan køber man billetter?",
    answer:
      "Billetter købes online her på sitet under Køb billetter. Du vælger forestillingsdato, billetter og eventuelle tilvalg og betaler sikkert med betalingskort. Billetten sendes på e-mail.",
  },
  {
    question: "Hvornår spiller Bakkens Hvile?",
    answer:
      "Der spilles over sommermånederne. De aktuelle spilledatoer og tider vises altid i billetkøbet, hvor du også kan se, om en dato er udsolgt.",
  },
  ...(SHOW_DURATION_TEXT
    ? [
        {
          question: "Hvor længe varer et show?",
          answer: `Et show varer ${SHOW_DURATION_TEXT}.`,
        },
      ]
    : []),
  {
    question: "Hvem er bakkesangerinderne?",
    answer: `Bakkesangerinderne — også kaldet syngepigerne — er sangerinderne på scenen i Bakkens Hvile. Sæsonens besætning er ${PERFORMERS.map((p) => p.name).join(", ")}, akkompagneret af kapelmester ${KAPELMESTER.name}.`,
  },
  {
    question: "Kan man bestille drikkevarer under showet?",
    answer:
      "Ja. Drikkevarer bestilles ved bordet under hele showet. Bestiller du drikkevarer online sammen med billetten senest kl. 12.00 på forestillingsdagen, får du 10 % rabat — herefter gælder de almindelige priser fra drikkekortet.",
  },
  {
    question: "Serveres der mad?",
    answer:
      "Nej, der serveres ikke mad i Bakkens Hvile — kun drikkevarer, som bestilles ved bordet under showet.",
  },
  {
    question: "Er der adgang for kørestolsbrugere?",
    answer: `Ja. Enkelte borde i salen er indrettet til kørestolsbrugere. Skriv til ${CONTACT.email} i forvejen, så vi kan reservere et af dem til jer.`,
  },
  {
    question: "Kan bakkesangerinderne bookes til fester og arrangementer?",
    answer:
      "Ja. Booking af sangerinderne til andre arrangementer sker direkte hos Tina Grunwald på tlf. 21 28 25 17.",
  },
  {
    question: "Hvornår fylder Bakkens Hvile 150 år?",
    answer: `Traditionen for bakkesangen går tilbage til ${FOUNDING_YEAR}, og 150-året fejres i ${ANNIVERSARY_YEAR}.`,
  },
];

export default function PraktiskPage() {
  return (
    <main>
      <JsonLd
        data={[
          breadcrumbs([
            ["Forside", "/"],
            ["Praktisk information", "/praktisk"],
          ]),
          faqJsonLd(FAQ),
        ]}
      />
      <SiteNav />

      <section className="section">
        <div className="prose">
          <p className="eyebrow">Godt at vide</p>
          <h1>Praktisk information &amp; FAQ</h1>
          <p className="lead">
            Her finder du svar på de mest stillede spørgsmål om Bakkens Hvile —
            adresse, billetter, drikkevarer og booking af bakkesangerinderne.
          </p>

          <h2>Adresse og kontakt</h2>
          <p>
            Bakkens Hvile
            <br />
            {ADDRESS.streetAddress}
            <br />
            {ADDRESS.postalCode} {ADDRESS.addressLocality}, Danmark
          </p>
          <p>
            E-mail: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
            <br />
            CVR: {CONTACT.cvr}
          </p>
          {GOOGLE_MAPS_URL && (
            <p>
              <a href={GOOGLE_MAPS_URL} target="_blank" rel="noopener noreferrer">
                Find vej på Google Maps
              </a>
            </p>
          )}

          <h2>Ofte stillede spørgsmål</h2>
          <div>
            {FAQ.map((item) => (
              <div className="faqItem" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
          </div>

          <h2>Betingelser</h2>
          <p>
            Se <Link href="/handelsbetingelser">handelsbetingelserne</Link> for
            køb af billetter og tilvalg samt{" "}
            <Link href="/privatlivspolitik">privatlivspolitikken</Link> for,
            hvordan vi behandler dine oplysninger.
          </p>

          <div className="ctaBand">
            <Link href="/book" className="ctaGold" style={{ padding: "16px 32px" }}>
              Køb billetter
            </Link>
            <Link href="/underholdning-til-fest" className="ctaOutline">
              Book sangerinderne
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
