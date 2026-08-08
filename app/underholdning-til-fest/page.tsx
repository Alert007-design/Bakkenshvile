import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import JsonLd from "../components/JsonLd";
import BookingForm from "../BookingForm";
import { billeder } from "@/lib/billeder";
import { CONTACT, FOUNDING_YEAR } from "@/lib/site-config";
import { pageMetadata, breadcrumbs } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("fest");

// Sitets centrale bookingside for eksterne optrædener. Én stærk side dækker
// beslægtede søgeintentioner (underholdning til fest, festunderholdning,
// sangere til fest, firmafest, fødselsdag, jubilæum, julefrokost) — bevidst
// IKKE opdelt i næsten identiske undersider (doorway-risiko). Opret først
// særskilte sider (fx en firmafest-side), når der findes reelt forskelligt,
// verificeret indhold til dem.
//
// TODO(redaktion): Følgende er IKKE dokumenteret i projektet og omtales derfor
// ikke på siden — tilføj gerne, når det er bekræftet: pris/prisniveau,
// geografisk dækningsområde, varighed af optræden, antal medvirkende,
// tekniske krav (lyd/scene), transport, samt om showet kan tilpasses.
// Ligeledes: om officielle firmapakker sælges via Bakken.dk — beskriv i så
// fald relationen og link til den officielle side i stedet for egne pakker.
export default function FestPage() {
  return (
    <main>
      <JsonLd
        data={breadcrumbs([
          ["Forside", "/"],
          ["Underholdning til fest", "/underholdning-til-fest"],
        ])}
      />
      <SiteNav />

      <section className="section">
        <div className="prose">
          <p className="eyebrow">Book bakkesangerinderne</p>
          <h1>Underholdning til fest — book bakkesangerinderne</h1>
          <p className="lead">
            Bakkesangerinderne fra Bakkens Hvile kan bookes til at optræde ved
            fester og arrangementer. En optræden med levende sang er en oplagt
            måde at overraske og glæde gæsterne på — et musikalsk indslag med
            feststemning, humor og en tradition, der går tilbage til{" "}
            {FOUNDING_YEAR}.
          </p>

          <h2>Et musikalsk indslag, der samler festen</h2>
          <p>
            Sangerinderne er vant til at optræde tæt på publikum og synge for
            alle slags folk. Repertoiret spænder fra klassiske danske sange og
            viser til satire over dagens overskrifter — skønsang og glimt i
            øjet, som hele selskabet kan være med på.{" "}
            <Link href="/sangerinderne">Mød sangerinderne her</Link>.
          </p>

          <figure>
            <Image
              src={billeder.showetRoedeKjoler.src}
              alt={billeder.showetRoedeKjoler.alt}
              width={billeder.showetRoedeKjoler.bredde}
              height={billeder.showetRoedeKjoler.hoejde}
              loading="lazy"
              sizes="(max-width: 900px) 100vw, 720px"
            />
          </figure>

          <h2>Fødselsdag, jubilæum, julefrokost eller firmafest?</h2>
          <p>
            Uanset om anledningen er en rund fødselsdag, et jubilæum, en
            julefrokost, en sommerfest eller en firmafest, er I velkomne til at
            sende en forespørgsel. Fortæl os om jeres arrangement — dato, sted
            og antal gæster — så vender vi tilbage med, hvad der kan lade sig
            gøre, og hvad det koster.
          </p>

          <h2>Pris og praktik</h2>
          <p>
            Pris og praktiske detaljer aftales individuelt ud fra jeres
            arrangement. Skriv til{" "}
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> eller brug
            formularen herunder for et uforpligtende svar.
          </p>

          <h2>Eller hold festaftenen i Bakkens Hvile</h2>
          <p>
            I kan også vende det om og tage festen med til showet:{" "}
            <Link href="/book">køb billetter til en forestilling</Link> i salen
            på Dyrehavsbakken, hvor I sidder ved dækkede borde og kan bestille
            vin, øl og drinks under hele showet. Se også{" "}
            <Link href="/praktisk">praktisk information</Link>.
          </p>

          <h2>Send en forespørgsel</h2>
        </div>

        <div className="bookWrap" style={{ marginTop: 24 }}>
          <BookingForm />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
