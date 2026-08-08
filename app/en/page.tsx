import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import JsonLd from "../components/JsonLd";
import { billeder } from "@/lib/billeder";
import {
  ADDRESS,
  CONTACT,
  FOUNDING_YEAR,
  ANNIVERSARY_YEAR,
} from "@/lib/site-config";
import { pageMetadata, breadcrumbs } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("english");

// Engelsk oversigtsside for internationale gæster ("live show Copenhagen",
// "unique things to do in Copenhagen" m.fl.). Kulturbegrebet "Bakkesangerinder"
// FORKLARES frem for at blive erstattet af et upræcist engelsk ord.
// hreflang (da-DK ↔ en) sættes i metadata via lib/seo.ts.
// lang="en" på indholdet, da roden er da.
//
// TODO(redaktion): Udvid til en fuld /en/-sektion (tickets, history, practical
// info på engelsk), når der er redaktionel kapacitet — arkitekturen (hreflang,
// sideregister i lib/seo.ts) er forberedt til det.
export default function EnglishPage() {
  return (
    <main lang="en">
      <JsonLd
        data={breadcrumbs([
          ["Forside", "/"],
          ["English", "/en"],
        ])}
      />
      <SiteNav />

      <section className="section">
        <div className="prose">
          <p className="eyebrow">Since {FOUNDING_YEAR} · Bakken, north of Copenhagen</p>
          <h1>Bakkens Hvile — a live singing tradition near Copenhagen</h1>
          <p className="lead">
            Bakkens Hvile is a historic stage at Dyrehavsbakken (&ldquo;Bakken&rdquo;)
            in Klampenborg, just north of Copenhagen. Since {FOUNDING_YEAR},
            the <em>Bakkesangerinder</em> — the traditional singing ladies of
            Bakken — have performed live songs, humour and musical satire here,
            up close to the audience.
          </p>

          <h2>What is a &ldquo;Bakkesangerinde&rdquo;?</h2>
          <p>
            A <em>Bakkesangerinde</em> (plural: <em>Bakkesangerinder</em>) is a
            singer in a uniquely Danish entertainment tradition: beloved Danish
            songs and classic tunes mixed with sung satire about the news of
            the day. It is neither a concert, a musical nor a conventional
            revue — it is <em>bakkesang</em>, a genre of its own, performed in
            this house for nearly 150 years.
          </p>

          <h2>The experience</h2>
          <p>
            You are seated at set tables in the hall, a few metres from the
            stage, and you can order wine, beer and drinks at your table
            throughout the show. Performances run during the summer months.
            Please note the show is performed in Danish.
          </p>

          <figure>
            <Image
              src={billeder.facaden.src}
              alt="The green facade of Bakkens Hvile at Dyrehavsbakken with the neon figure on the roof"
              width={billeder.facaden.bredde}
              height={billeder.facaden.hoejde}
              loading="lazy"
              sizes="(max-width: 900px) 100vw, 720px"
            />
            <figcaption>
              Bakkens Hvile at Dyrehavsbakken, north of Copenhagen.
            </figcaption>
          </figure>

          <h2>Where to find us</h2>
          <p>
            {ADDRESS.streetAddress}, {ADDRESS.postalCode}{" "}
            {ADDRESS.addressLocality}, Denmark — at Dyrehavsbakken, the historic
            amusement area by the Dyrehaven beech forest north of Copenhagen.
          </p>

          <h2>Tickets</h2>
          <p>
            Show dates and tickets are available in our online{" "}
            <Link href="/book">ticket shop</Link> (in Danish). Questions in
            English are welcome by e-mail:{" "}
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
          </p>

          <h2>150 years in {ANNIVERSARY_YEAR}</h2>
          <p>
            The tradition dates back to {FOUNDING_YEAR}, and Bakkens Hvile
            celebrates its 150th anniversary in {ANNIVERSARY_YEAR}. Read more
            (in Danish) about <Link href="/historie">the history</Link> and{" "}
            <Link href="/150-aar">the anniversary</Link>.
          </p>

          <div className="ctaBand">
            <Link href="/book" className="ctaGold" style={{ padding: "16px 32px" }}>
              Buy tickets
            </Link>
            <Link href="/" className="ctaOutline">
              Dansk version
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
