import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import JsonLd from "../components/JsonLd";
import { billeder } from "@/lib/billeder";
import { ADDRESS, FOUNDING_YEAR } from "@/lib/site-config";
import { pageMetadata, breadcrumbs } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("showKoebenhavn");

// Landingsside for gæster, der leder efter et show / live underholdning i
// København-området. Ærlig geografi: Bakkens Hvile ligger på Dyrehavsbakken i
// Klampenborg, NORD for København — det fremgår tydeligt. Genren beskrives
// præcist som bakkesang (ikke musical, koncert eller revy).
export default function ShowKoebenhavnPage() {
  return (
    <main>
      <JsonLd
        data={breadcrumbs([
          ["Forside", "/"],
          ["Show i København", "/show-koebenhavn"],
        ])}
      />
      <SiteNav />

      <section className="section">
        <div className="prose">
          <p className="eyebrow">Live underholdning nord for København</p>
          <h1>Show i København? Oplev Bakkens Hvile på Dyrehavsbakken</h1>
          <p className="lead">
            Leder du efter et show, live musik eller en sjov aften i København?
            Bakkens Hvile ligger på Dyrehavsbakken i Klampenborg, lige nord for
            København — her har bakkesangerinderne siden {FOUNDING_YEAR}{" "}
            underholdt med levende sang, humor og samfundssatire, tæt på
            publikum og med drikkevarer serveret ved bordet.
          </p>

          <h2>En anderledes aften ud over det sædvanlige</h2>
          <p>
            Bakkesang er en genre helt for sig selv — hverken koncert, musical
            eller traditionel revy. Showet blander klassiske danske sange og
            viser med syngende satire over dagens friskeste overskrifter, og
            det har fra begyndelsen været for alle og om alle. Det er en
            oplevelse med historie i væggene, som hverken store scener eller
            streaming kan kopiere.
          </p>

          <h2>Live sang, musik og humor tæt på publikum</h2>
          <p>
            I salen sidder du ved dækkede borde få meter fra scenen, mens{" "}
            <Link href="/sangerinderne">bakkesangerinderne</Link> og husets
            kapelmester leverer showet. Du kan bestille vin, øl og drinks ved
            bordet under hele forestillingen — se{" "}
            <Link href="/priser">drikkekortet</Link>.
          </p>

          <figure>
            <Image
              src={billeder.denTommeSal.src}
              alt={billeder.denTommeSal.alt}
              width={billeder.denTommeSal.bredde}
              height={billeder.denTommeSal.hoejde}
              loading="lazy"
              sizes="(max-width: 900px) 100vw, 720px"
            />
            <figcaption>
              Salen i Bakkens Hvile med dækkede borde foran scenen.
            </figcaption>
          </figure>

          <h2>Bakkens Hvile på Dyrehavsbakken</h2>
          <p>
            Adressen er {ADDRESS.streetAddress}, {ADDRESS.postalCode}{" "}
            {ADDRESS.addressLocality} — midt på Dyrehavsbakken ved Dyrehavens
            bøgeskov, nord for København. Showet spilles over sommermånederne.
            Find vej og få svar på praktiske spørgsmål på{" "}
            <Link href="/praktisk">praktisk information</Link>.
          </p>

          <h2>Hvem passer oplevelsen til?</h2>
          <p>
            Bakkesangen har siden {FOUNDING_YEAR} været for alle slags folk —
            par, venner, familier og selskaber. Kommer I flere afsted, kan
            aftenen også kombineres med resten af Dyrehavsbakkens forlystelser
            og spisesteder. Vil I have sangerinderne ud til jeres eget
            arrangement, kan de{" "}
            <Link href="/underholdning-til-fest">bookes til fester</Link>.
          </p>

          <h2>Billetter og spilledatoer</h2>
          <p>
            Aktuelle spilledatoer og billetter findes i{" "}
            <Link href="/book">billetkøbet</Link>. Du vælger dato og billetter,
            kan bestille drikkevarer online med 10&nbsp;% rabat senest kl.
            12.00 på forestillingsdagen, og betaler sikkert online.
          </p>

          <h2>Praktiske spørgsmål</h2>
          <p>
            Svar på de mest stillede spørgsmål — adresse, transport, billetter
            og bestilling af drikkevarer — er samlet på{" "}
            <Link href="/praktisk">praktisk information &amp; FAQ</Link>.
          </p>

          <div className="ctaBand">
            <Link href="/book" className="ctaGold" style={{ padding: "16px 32px" }}>
              Se spilledatoer &amp; køb billetter
            </Link>
            <Link href="/praktisk" className="ctaOutline">
              Praktisk information
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
