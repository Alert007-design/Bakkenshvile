import Link from "next/link";
import BookingForm from "./BookingForm";

const NAV_LINKS = [
  { href: "#om-os", label: "Om os" },
  { href: "#sangerinderne", label: "Sangerinderne" },
  { href: "#priser", label: "Priser" },
  { href: "#galleri", label: "Galleri" },
  { href: "#kontakt", label: "Kontakt" },
];

const SINGERS = [
  {
    name: "Tina Grunwald",
    img: "https://bakkenshvile.dk/wp-content/uploads/2022/02/Tina_8-scaled-e1741510102102-996x1024.jpg",
  },
  {
    name: "Sus Mathiasen",
    img: "https://bakkenshvile.dk/wp-content/uploads/2022/02/Sus_8-2-scaled-e1741510084624-954x1024.jpg",
  },
  {
    name: "Dot Wessman",
    img: "https://bakkenshvile.dk/wp-content/uploads/2022/02/Dot_13-1-scaled-e1741510063380-1024x1015.jpg",
  },
  {
    name: "Ann Farholt",
    img: "https://bakkenshvile.dk/wp-content/uploads/2022/02/01-scaled-e1741510040457-912x1024.jpg",
  },
];

const PRICE_TIERS = [
  {
    title: "Aftenshow",
    price: "Fra 299 kr",
    desc: "Tirsdag–lørdag aften. Bakkesangerinderne på scenen, baren åben under hele showet.",
  },
  {
    title: "Søndags Show",
    price: "Fra 319 kr",
    desc: "Udvalgte søndage eftermiddag — samme show, roligere tempo.",
  },
  {
    title: "150 års Jubilæumsshow 2027",
    price: "Fra 209 kr",
    desc: "Forpremiere og jubilæumsforestillinger maj–september 2027.",
  },
];

export default function Home() {
  const year = new Date().getFullYear();

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://bakkenshvile.dk/wp-content/uploads/2022/03/222637436_4168397549942839_7215734764110107219_n.jpeg"
            alt="Bakkesangerinderne på scenen"
          />
          <div className="heroScrim" />
        </div>
        <div className="heroInner">
          <p className="eyebrow">Dyrehavsbakken · Snart 150 år på scenen</p>
          <h1>
            Skønsang &amp; samfundssatire, live.
          </h1>
          <p className="heroLead">
            Bakkesangerinderne har underholdt Dyrehavsbakken siden
            1800-tallet — fra fine sonetter til dagens friskeste satire.
            Oplev showet, betjen dig i baren, og bliv en del af traditionen.
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
              Traditionen startede i starten af 1800-tallet på så fine
              steder som d&apos;Angleterre og Det Kongelige Teater. Vores
              sange spænder fra smukke sonetter fra tidernes morgen til
              gårsdagens friskeste overskrifter.
            </p>
            <p>
              Oplev os over sommermånederne i vores smukke bøgeskov, og smag
              på udvalget i baren, som du kan betjene dig af under hele
              showet.
            </p>
          </div>
          <div className="aboutPhoto">
            <div className="placeholder" style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
      </section>

      <section id="sangerinderne" className="section sectionAlt">
        <div className="wrap" style={{ padding: 0 }}>
          <p className="eyebrow" style={{ textAlign: "center" }}>
            Sæsonens ensemble
          </p>
          <h2 className="sectionTitle">Sangerinderne 2025</h2>
          <div className="singerGrid">
            {SINGERS.map((singer) => (
              <div className="singerCard" key={singer.name}>
                <div className="singerPhoto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={singer.img} alt={singer.name} />
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
          <div className="priceGrid">
            {PRICE_TIERS.map((tier) => (
              <div className="priceCard" key={tier.title}>
                <h3>{tier.title}</h3>
                <p className="amount">{tier.price}</p>
                <p className="desc">{tier.desc}</p>
              </div>
            ))}
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://bakkenshvile.dk/wp-content/uploads/2022/03/222637436_4168397549942839_7215734764110107219_n.jpeg"
                alt="Foto fra showet"
              />
            </div>
            <div className="placeholder">Foto fra baren</div>
            <div className="placeholder">Foto af publikum</div>
            <div className="placeholder">Foto af bøgeskoven</div>
            <div className="placeholder">Foto bag scenen</div>
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
                <p className="label">Sæson</p>
                <p>
                  Maj–september, aftenshow tirsdag–lørdag samt udvalgte
                  søndage.
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
                  rel="noopener"
                >
                  Instagram
                </a>
                <a
                  href="https://www.facebook.com/bakkenshvile"
                  target="_blank"
                  rel="noopener"
                >
                  Facebook
                </a>
              </div>
            </div>
          </div>
          <div className="contactPhoto">
            <div className="placeholder" style={{ width: "100%", height: "100%" }}>
              Kort over Dyrehavsbakken / vejvisning
            </div>
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
