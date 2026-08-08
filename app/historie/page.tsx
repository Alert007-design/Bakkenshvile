import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import JsonLd from "../components/JsonLd";
import { billeder } from "@/lib/billeder";
import { FOUNDING_YEAR, ANNIVERSARY_YEAR } from "@/lib/site-config";
import { pageMetadata, breadcrumbs } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("historie");

// Historisk indhold: KUN verificerede oplysninger fra husets eget materiale
// (1877 som traditionens begyndelse, 150 år i 2027, husets rolle som ramme om
// bakkesangerindernes scene). TODO(redaktion): Kronologien herunder har kun to
// bekræftede nedslag — suppler med flere årstal og begivenheder (kilder!), fx
// kendte sangerinder gennem tiden, ombygninger og tidligere jubilæer, når
// faktatjekket materiale foreligger. Opfind aldrig årstal.
export default function HistoriePage() {
  return (
    <main>
      <JsonLd
        data={breadcrumbs([
          ["Forside", "/"],
          ["Historien", "/historie"],
        ])}
      />
      <SiteNav />

      <section className="section">
        <div className="prose">
          <p className="eyebrow">Siden {FOUNDING_YEAR}</p>
          <h1>Bakkens Hviles historie</h1>
          <p className="lead">
            Bakkens Hvile er navnet på bygningen, der danner rammen om
            bakkesangerindernes scene på Dyrehavsbakken i Klampenborg.
            Traditionen for bakkesangen går tilbage til {FOUNDING_YEAR} — og
            har fra begyndelsen været for alle slags folk.
          </p>

          <h2>En scene for alle og om alle</h2>
          <p>
            I snart 150 år har scenen leveret skønsang og syngende
            samfundssatire for alle og om alle. Repertoiret spænder fra
            klassiske danske sange og viser til dagens friskeste overskrifter —
            en genre helt for sig selv, som hverken er koncert, musical eller
            traditionel revy, men netop bakkesang.
          </p>
          <p>
            Showet opleves ved dækkede borde i salen, hvor gæsterne kan bestille
            vin, øl og drinks under hele forestillingen, mens sangerinderne
            optræder tæt på publikum.
          </p>

          <figure>
            <Image
              src={billeder.kennethIGarderobedoeren.src}
              alt={billeder.kennethIGarderobedoeren.alt}
              width={billeder.kennethIGarderobedoeren.bredde}
              height={billeder.kennethIGarderobedoeren.hoejde}
              loading="lazy"
              sizes="(max-width: 900px) 100vw, 720px"
            />
            <figcaption>
              Garderobedørens karm bærer årtiers autografer fra husets
              sangerinder og gæster.
            </figcaption>
          </figure>

          <h2>Kronologi</h2>
          <ul className="timeline">
            <li>
              <span className="aar">{FOUNDING_YEAR}</span>
              Traditionen for bakkesangen begynder på Dyrehavsbakken.
            </li>
            <li>
              <span className="aar">{ANNIVERSARY_YEAR}</span>
              Bakkens Hvile fejrer{" "}
              <Link href="/150-aar">150 år med bakkesang</Link> (
              {FOUNDING_YEAR}–{ANNIVERSARY_YEAR}).
            </li>
          </ul>

          <figure>
            <Image
              src={billeder.dotUngdomMedRoser.src}
              alt={billeder.dotUngdomMedRoser.alt}
              width={billeder.dotUngdomMedRoser.bredde}
              height={billeder.dotUngdomMedRoser.hoejde}
              loading="lazy"
              sizes="(max-width: 900px) 100vw, 720px"
            />
            <figcaption>
              Arkivfoto: et ungt portræt af Dot Wessman — en af sæsonens{" "}
              <Link href="/sangerinderne">bakkesangerinder</Link> — med et fang
              røde roser.
            </figcaption>
          </figure>

          <h2>Traditionen i dag</h2>
          <p>
            Bakkesangen lever videre hver sæson, når{" "}
            <Link href="/sangerinderne">sæsonens bakkesangerinder</Link> går på
            scenen over sommermånederne. Du kan opleve den selv:{" "}
            <Link href="/book">se spilledatoer og køb billetter</Link> — eller{" "}
            <Link href="/underholdning-til-fest">
              book sangerinderne til jeres eget arrangement
            </Link>
            .
          </p>

          <div className="ctaBand">
            <Link href="/book" className="ctaGold" style={{ padding: "16px 32px" }}>
              Køb billetter
            </Link>
            <Link href="/150-aar" className="ctaOutline">
              Om 150-års jubilæet
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
