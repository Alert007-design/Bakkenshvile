import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import JsonLd from "../components/JsonLd";
import { billeder } from "@/lib/billeder";
import {
  FOUNDING_YEAR,
  ANNIVERSARY_YEAR,
  CONTACT,
} from "@/lib/site-config";
import { pageMetadata, breadcrumbs } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("jubilaeum");

// Evergreen jubilæumsside på en permanent URL (/150-aar) — ingen
// kampagneparametre, så al SEO-værdi samles her før, under og efter jubilæet.
//
// TODO(redaktion): Når jubilæumsprogrammet er bekræftet (showtitel, premiere,
// medvirkende, særlige arrangementer), tilføjes det her — og et Event-schema
// kan da bygges af de samme data. Indtil da omtales KUN det bekræftede:
// årstallene 1877–2027 og at der spilles i jubilæumssæsonen (datoer i /book).
export default function JubilaeumPage() {
  return (
    <main>
      <JsonLd
        data={breadcrumbs([
          ["Forside", "/"],
          ["150 år", "/150-aar"],
        ])}
      />
      <SiteNav />

      <section className="section">
        <div className="prose">
          <p className="eyebrow">
            {FOUNDING_YEAR}–{ANNIVERSARY_YEAR}
          </p>
          <h1>Bakkens Hvile fylder 150 år i {ANNIVERSARY_YEAR}</h1>
          <p className="lead">
            I {ANNIVERSARY_YEAR} er det 150 år siden, traditionen for
            bakkesangen begyndte på Dyrehavsbakken i {FOUNDING_YEAR}. Det
            fejrer Bakkens Hvile — scenen, hvor bakkesangerinderne stadig
            leverer skønsang og syngende samfundssatire, sæson efter sæson.
          </p>

          <h2>150 år med bakkesang</h2>
          <p>
            Siden {FOUNDING_YEAR} har bakkesangen været for alle slags folk:
            klassiske danske sange og viser blandet med satire over dagens
            friskeste overskrifter, fremført ved dækkede borde i salen på
            Dyrehavsbakken. Læs hele fortællingen på siden om{" "}
            <Link href="/historie">Bakkens Hviles historie</Link>.
          </p>

          <figure>
            <Image
              src={billeder.blomstersangen.src}
              alt={billeder.blomstersangen.alt}
              width={billeder.blomstersangen.bredde}
              height={billeder.blomstersangen.hoejde}
              loading="lazy"
              sizes="(max-width: 900px) 100vw, 720px"
            />
            <figcaption>
              Bakkesangerinderne synger blomstersangen med favnen fuld af røde
              roser.
            </figcaption>
          </figure>

          <h2>Jubilæumssæsonen og billetter</h2>
          <p>
            Sæsonens forestillinger spilles over sommermånederne. De aktuelle
            spilledatoer og billetter findes altid i{" "}
            <Link href="/book">billetkøbet</Link> — her ser du datoer, priser
            og tilvalg og betaler sikkert online.
          </p>
          <p>
            Vil I fejre jubilæet til jeres eget arrangement? Bakkesangerinderne
            kan <Link href="/underholdning-til-fest">bookes til fester</Link>.
          </p>

          <h2>Mød sangerinderne</h2>
          <p>
            Traditionen bæres i dag videre af{" "}
            <Link href="/sangerinderne">sæsonens bakkesangerinder</Link> og
            husets kapelmester — mød dem, og se hvem der står på scenen i
            jubilæumssæsonen.
          </p>

          <h2>Presse</h2>
          <p>
            Pressehenvendelser om jubilæet er velkomne på{" "}
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
          </p>

          <div className="ctaBand">
            <Link href="/book" className="ctaGold" style={{ padding: "16px 32px" }}>
              Se spilledatoer &amp; køb billetter
            </Link>
            <Link href="/historie" className="ctaOutline">
              Læs historien
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
