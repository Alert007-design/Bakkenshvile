import Link from "next/link";
import Image from "next/image";
import BookingForm from "./BookingForm";
import HeroMedia from "./components/HeroMedia";
import { billeder, type Billede } from "@/lib/billeder";

const NAV_LINKS = [
  { href: "#om-os", label: "Om os" },
  { href: "#sangerinderne", label: "Sangerinderne" },
  { href: "#priser", label: "Priser" },
  { href: "#galleri", label: "Galleri" },
  { href: "#kontakt", label: "Kontakt" },
];

// Navngivne portrætter — dedikerede lokale kopier i public/ (via lib/billeder.ts),
// så intet hentes fra bakkenshvile.dk, der lukkes ned.
const SINGERS: { name: string; billede: Billede }[] = [
  { name: "Tina Grunwald", billede: billeder.tinaGrunwald },
  { name: "Sus Mathiasen", billede: billeder.susMathiasen },
  { name: "Dot Wessman", billede: billeder.dotWessman },
  { name: "Ann Farholt", billede: billeder.annFarholt },
];

// Portrætmosaik til galleriet. Første element er featuren (2×2).
// object-position skubber årstalsskiltet i BH (6) ud af beskæringen.
const GALLERI: { billede: Billede; objectPosition: string }[] = [
  { billede: billeder.denTommeSal, objectPosition: "center 55%" },
  { billede: billeder.denTommeGarderobe, objectPosition: "center" },
  { billede: billeder.blomstersangen, objectPosition: "72% 70%" },
  { billede: billeder.dotAleneMedRose, objectPosition: "center 30%" },
  { billede: billeder.salenMedPjerrot, objectPosition: "center" },
  { billede: billeder.roserTilScenen, objectPosition: "center 40%" },
  { billede: billeder.garderobenFoerShow, objectPosition: "center 35%" },
  { billede: billeder.firePigerVedTaeppet, objectPosition: "center 28%" },
  { billede: billeder.trePigerVedTaeppet, objectPosition: "center 28%" },
];

const JUBILEE = {
  title: "150 års jubilæumssæson 2027",
  price: "Ordinær fra 289 kr",
  desc: "Hele 2027 fejrer vi 150 år på Dyrehavsbakken med en samlet jubilæumssæson. Book jeres billet og vær med til at fejre det med os.",
  note: "De to forpremierer 10. og 11. maj 2027 har lavere priser — fra 179 kr. Se de gældende priser for hver enkelt dato, når du vælger den.",
};

export default function Home() {
  const year = new Date().getFullYear();
  const [feature, ...galleryRest] = GALLERI;

  return (
    <main>
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
          <p className="eyebrow">Bakkens Hvile – 150 år på Dyrehavsbakken</p>
          <h1>
            Skønsang &amp; samfundssatire, live.
          </h1>
          <p className="heroLead">
            Bakkesangerinderne har underholdt på Dyrehavsbakken siden 1877 —
            fra klassiske danske sange og viser til dagens friskeste
            satire. Oplev showet, bestil drinks i baren, og bliv en del af
            traditionen.
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
              leveret skønsang og syngende samfundssatire til alle, om alle.
            </p>
            <p>
              Traditionen startede i 1877 på så fine steder som
              d&apos;Angleterre og Det Kongelige Teater — og har fra
              begyndelsen været for alle slags folk. Vores sange spænder fra
              klassiske danske sange og viser til gårsdagens friskeste
              overskrifter.
            </p>
            <p>
              Oplev os over sommermånederne i vores smukke bøgeskov, og
              bestil drinks i baren under hele showet.
            </p>
          </div>
          <div className="aboutPhoto">
            <Image
              src={billeder.dotUngdomMedRoser.src}
              alt={billeder.dotUngdomMedRoser.alt}
              width={billeder.dotUngdomMedRoser.bredde}
              height={billeder.dotUngdomMedRoser.hoejde}
              loading="lazy"
              sizes="(max-width: 900px) 100vw, 528px"
              style={{ objectPosition: "center 30%" }}
            />
          </div>
        </div>
      </section>

      <section id="sangerinderne" className="section sectionAlt">
        <div className="wrap" style={{ padding: 0 }}>
          <p className="eyebrow" style={{ textAlign: "center" }}>
            Sæsonens ensemble
          </p>
          <h2 className="sectionTitle">Sangerinderne 2027</h2>
          <div className="singerGrid">
            {SINGERS.map((singer) => (
              <div className="singerCard" key={singer.name}>
                <div className="singerPhoto">
                  <Image
                    src={singer.billede.src}
                    alt={singer.billede.alt}
                    width={singer.billede.bredde}
                    height={singer.billede.hoejde}
                    loading="lazy"
                    sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 276px"
                    style={{ objectPosition: "center 25%" }}
                  />
                </div>
                <p className="singerName">{singer.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="priser" className="section">
        <div className="wrap" style={{ padding: 0 }}>
          <p className="eyebrow" style={{ textAlign: "center" }}>
            Billetter
          </p>
          <h2 className="sectionTitle">Priser &amp; forestillinger</h2>
          <div className="jubileeCard">
            <h3>{JUBILEE.title}</h3>
            <p className="amount">{JUBILEE.price}</p>
            <p className="desc">{JUBILEE.desc}</p>
            <p className="desc jubileeNote">{JUBILEE.note}</p>
          </div>
          <div style={{ textAlign: "center", marginTop: 48 }}>
            <Link
              href="/book"
              className="ctaGold"
              style={{ padding: "16px 32px" }}
            >
              Se alle datoer &amp; køb billetter
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
            herunder for at booke eller høre om pris.
          </p>
          <BookingForm />
        </div>
      </section>

      <section id="kontakt" className="section sectionAlt">
        <div className="contactGrid">
          <div>
            <p className="eyebrow">Find os</p>
            <h2>Kontakt &amp; åbningstider</h2>
            <div className="contactList">
              <div>
                <p className="label">Adresse</p>
                <p>Dyrehavsbakken 38, 2930 Klampenborg</p>
              </div>
              <div>
                <p className="label">Spørgsmål</p>
                <p>
                  Har du et spørgsmål, så send en mail.{" "}
                  <a href="mailto:kontor@bakkenshvile.dk">
                    kontor@bakkenshvile.dk
                  </a>
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

      <footer className="footer">
        <div className="brand">BAKKENS HVILE</div>
        <div className="meta">
          Dyrehavsbakken 38 · 2930 Klampenborg · © {year}
        </div>
      </footer>
    </main>
  );
}
