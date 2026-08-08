import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import BookingForm from "./BookingForm";
import HeroMedia from "./components/HeroMedia";
import JsonLd from "./components/JsonLd";
import SiteFooter from "./components/SiteFooter";
import { billeder, type Billede } from "@/lib/billeder";
import { isOrderingEnabled } from "@/lib/table-ordering-config";
import {
  CURRENT_SEASON_LABEL,
  FOUNDING_YEAR,
  PERFORMERS,
  KAPELMESTER,
} from "@/lib/site-config";
import { pageMetadata, organizationGraph } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("forside");

const NAV_LINKS = [
  { href: "#om-os", label: "Om os" },
  { href: "#sangerinderne", label: "Sangerinderne" },
  { href: "#priser", label: "Priser" },
  { href: "#galleri", label: "Galleri" },
  { href: "#kontakt", label: "Kontakt" },
];

// Portrætmosaik til galleriet. Første element er featuren (2×2).
// object-position skubber årstalsskiltet i BH (6) ud af beskæringen.
const GALLERI: { billede: Billede; objectPosition: string }[] = [
  { billede: billeder.denTommeSal, objectPosition: "center 55%" },
  { billede: billeder.blomstersangen, objectPosition: "72% 70%" },
  { billede: billeder.dotAleneMedRose, objectPosition: "center 30%" },
];

export default function Home() {
  const [feature, ...galleryRest] = GALLERI;
  // QR-bestilling nævnes kun som en aktiv mulighed, når funktionen reelt er slået
  // til. Ellers omtales bordbestilling uden QR (undgår at love noget, der ikke
  // virker endnu).
  const qrOrdering = isOrderingEnabled();

  return (
    <main>
      <JsonLd data={organizationGraph()} />
      <nav className="nav">
        <div className="logo">
          BAKKENS <span className="logoAccent">HVILE</span>
        </div>
        <div className="navlinks">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
          <Link href="/book" className="navCta">
            Køb billetter
          </Link>
        </div>
      </nav>

      <section id="forside" className="hero">
        <div className="heroBg">
          <HeroMedia />
          <div className="heroScrim" />
        </div>
        <div className="heroInner">
          <p className="eyebrow">
            Bakkens Hvile · Live show på Dyrehavsbakken siden {FOUNDING_YEAR}
          </p>
          <h1>
            Skønsang &amp; samfundssatire, live.
          </h1>
          <p className="heroLead">
            Bakkesangerinderne har underholdt på Dyrehavsbakken i Klampenborg
            siden {FOUNDING_YEAR} — fra klassiske danske sange og viser til
            dagens friskeste satire. Oplev showet, bestil vin, øl og drinks ved
            bordet, og bliv en del af traditionen.
          </p>
          <div className="heroCtas">
            <Link href="/book" className="ctaGoldLg">
              Køb billetter
            </Link>
            <a href="#book" className="ctaOutline">
              Book syngepigerne
            </a>
          </div>
        </div>
      </section>

      <section id="om-os" className="section">
        <div className="aboutGrid">
          <div>
            <p className="eyebrow">Om Bakkens Hvile</p>
            <h2>D&apos;damer og d&apos;herrer og alt derimellem.</h2>
            <p>
              Bakkens Hvile er navnet på bygningen, der danner rammen om
              bakkesangerindernes scene — en scene, som i snart 150 år har
              leveret skønsang og syngende samfundssatire for alle og om alle.
            </p>
            <p>
              Traditionen for bakkesangen går tilbage til {FOUNDING_YEAR} og
              har fra begyndelsen været for alle slags folk. Vores sange
              spænder fra klassiske danske sange og viser til dagens friskeste
              overskrifter.
            </p>
            <p>
              Oplev os over sommermånederne i vores smukke bøgeskov, og
              bestil vin, øl og drinks ved bordet under hele showet.
            </p>
            <p>
              Læs mere om <Link href="/historie">Bakkens Hviles historie</Link>{" "}
              — og om <Link href="/150-aar">150-års jubilæet i 2027</Link>.
            </p>
          </div>
          <div className="aboutPhoto">
            <Image
              src={billeder.firePigerVedTaeppet.src}
              alt={billeder.firePigerVedTaeppet.alt}
              width={billeder.firePigerVedTaeppet.bredde}
              height={billeder.firePigerVedTaeppet.hoejde}
              loading="lazy"
              sizes="(max-width: 900px) 100vw, 528px"
              style={{ objectPosition: "center 20%" }}
            />
          </div>
        </div>
      </section>

      <section id="sangerinderne" className="section sectionAlt">
        <div className="wrap" style={{ padding: 0 }}>
          <p className="eyebrow" style={{ textAlign: "center" }}>
            Sæsonens ensemble
          </p>
          <h2 className="sectionTitle">Sangerinderne {CURRENT_SEASON_LABEL}</h2>
          <div className="singerGrid">
            {PERFORMERS.map((singer) => {
              const billede = billeder[singer.billedeKey];
              return (
                <div className="singerCard" key={singer.name}>
                  <div className="singerPhoto">
                    <Image
                      src={billede.src}
                      alt={billede.alt}
                      width={billede.bredde}
                      height={billede.hoejde}
                      loading="lazy"
                      sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 276px"
                      style={{ objectPosition: "center 25%" }}
                    />
                  </div>
                  <p className="singerName">{singer.name}</p>
                </div>
              );
            })}
          </div>
          <figure className="kapelmesterFeature">
            <div className="kapelmesterPhoto">
              <Image
                src={billeder.kennethMedSyngepigerne.src}
                alt={billeder.kennethMedSyngepigerne.alt}
                width={billeder.kennethMedSyngepigerne.bredde}
                height={billeder.kennethMedSyngepigerne.hoejde}
                loading="lazy"
                sizes="(max-width: 900px) 100vw, 900px"
                style={{ objectPosition: "center 30%" }}
              />
            </div>
            <figcaption className="kapelmesterCaption">
              Kapelmester {KAPELMESTER.name}.
            </figcaption>
          </figure>
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <Link href="/sangerinderne" className="ctaOutline">
              Mød bakkesangerinderne
            </Link>
          </div>
        </div>
      </section>

      <section id="priser" className="section">
        <div className="wrap" style={{ padding: 0 }}>
          <p className="eyebrow" style={{ textAlign: "center" }}>
            Baren
          </p>
          <h2 className="sectionTitle">Priser</h2>
          <p
            style={{
              maxWidth: 640,
              margin: "0 auto",
              textAlign: "center",
              color: "var(--paper-dim)",
              fontSize: 18,
              lineHeight: 1.6,
            }}
          >
            Bestil drikkevarer online med{" "}
            <strong style={{ color: "var(--gold)" }}>10 % rabat</strong> senest
            kl. 12.00 på forestillingsdagen. Herefter gælder de almindelige
            priser.{" "}
            {qrOrdering
              ? "Bestilling via QR-systemet og ved bordene sker til fuld pris."
              : "Bestilling ved bordene sker til fuld pris."}
          </p>
          <p
            style={{
              maxWidth: 640,
              margin: "16px auto 0",
              textAlign: "center",
              color: "var(--paper-dim)",
              fontSize: 16,
              lineHeight: 1.6,
            }}
          >
            {qrOrdering
              ? "Drikkevarer bestilles ved bordet — enten via QR-systemet eller hos tjenerne. Der modtages ikke bestillinger i baren."
              : "Drikkevarer bestilles ved bordet hos tjenerne. Der modtages ikke bestillinger i baren."}
          </p>
          <div
            style={{
              textAlign: "center",
              marginTop: 40,
              display: "flex",
              gap: 16,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link href="/book" className="ctaGold" style={{ padding: "16px 32px" }}>
              Køb billetter
            </Link>
            <Link href="/priser" className="ctaOutline">
              Se hele drikkekortet
            </Link>
          </div>
        </div>
      </section>

      <section id="galleri" className="section sectionAlt">
        <div className="wrap" style={{ padding: 0 }}>
          <p className="eyebrow" style={{ textAlign: "center" }}>
            Stemning
          </p>
          <h2 className="sectionTitle">Billedgalleri</h2>
          <div className="galleryGrid">
            <div className="galleryFeature">
              <Image
                src={feature.billede.src}
                alt={feature.billede.alt}
                width={feature.billede.bredde}
                height={feature.billede.hoejde}
                loading="lazy"
                sizes="(max-width: 560px) 100vw, (max-width: 900px) 66vw, 790px"
                style={{ objectPosition: feature.objectPosition }}
              />
            </div>
            {galleryRest.map(({ billede, objectPosition }) => (
              <Image
                key={billede.src}
                src={billede.src}
                alt={billede.alt}
                width={billede.bredde}
                height={billede.hoejde}
                loading="lazy"
                sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 387px"
                style={{ objectPosition }}
              />
            ))}
          </div>
        </div>
      </section>

      <section id="book" className="section">
        <div className="bookWrap">
          <p className="eyebrow" style={{ textAlign: "center" }}>
            Private arrangementer
          </p>
          <h2 className="sectionTitle" style={{ marginBottom: 24 }}>
            Vil du booke syngepigerne?
          </h2>
          <p className="bookLead">
            Skal du holde fest? En optræden med bakkesangerinderne er den
            perfekte måde at overraske og glæde dine gæster på. Skriv til os
            herunder for at booke eller høre om pris — og læs mere på siden om{" "}
            <Link href="/underholdning-til-fest">underholdning til fest</Link>.
          </p>
          <BookingForm />
        </div>
      </section>

      <section id="kontakt" className="section sectionAlt">
        <div className="contactGrid">
          <div>
            <p className="eyebrow">Find os</p>
            <h2>Kontakt &amp; adresse</h2>
            <div className="contactList">
              <div>
                <p className="label">Adresse</p>
                <p>Dyrehavsbakken 38, 2930 Klampenborg</p>
              </div>
              <div>
                <p className="label">Spørgsmål</p>
                <p>
                  Har du et spørgsmål, så send en mail:{" "}
                  <a href="mailto:kontor@bakkenshvile.dk">
                    kontor@bakkenshvile.dk
                  </a>{" "}
                  — eller se{" "}
                  <Link href="/praktisk">praktisk information &amp; FAQ</Link>.
                </p>
              </div>
              <div>
                <p className="label">Booking af syngepiger</p>
                <p>
                  <a href="mailto:kontor@bakkenshvile.dk">
                    kontor@bakkenshvile.dk
                  </a>
                </p>
              </div>
              <div className="contactSocial">
                <a
                  href="https://www.instagram.com/bakkenshvile/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Instagram
                </a>
                <a
                  href="https://www.facebook.com/bakkenshvile"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Facebook
                </a>
              </div>
            </div>
          </div>
          <div className="contactPhoto">
            <Image
              src={billeder.facaden.src}
              alt={billeder.facaden.alt}
              width={billeder.facaden.bredde}
              height={billeder.facaden.hoejde}
              loading="lazy"
              sizes="(max-width: 900px) 100vw, 528px"
              style={{ objectPosition: "center" }}
            />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
