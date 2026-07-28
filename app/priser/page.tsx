import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Drikkekort & priser — Bakkens Hvile",
  description:
    "Se hele drikkekortet på Bakkens Hvile: øl, vin, drinks, spiritus og snacks. Køb online sammen med billetten og få 10% rabat.",
};

// Husets drikkekort. Priser i hele kroner, som de står i salen.
const GROUPS: { title: string; items: { name: string; price: string }[] }[] = [
  {
    title: "Øl",
    items: [
      { name: "Grøn Tuborg, lille", price: "50 kr." },
      { name: "Grøn Tuborg, stor", price: "80 kr." },
      { name: "Tuborg Classic, lille", price: "50 kr." },
      { name: "Tuborg Classic, stor", price: "80 kr." },
      { name: "Tuborg Half & Half, lille", price: "55 kr." },
      { name: "Tuborg Half & Half, stor", price: "85 kr." },
      { name: "Nordic alkoholfri øl", price: "55 kr." },
      { name: "Kande med Half & Half, citronvand og 2 cl Pernod", price: "249 kr." },
    ],
  },
  {
    title: "Sodavand og vand",
    items: [
      { name: "Coca-Cola", price: "50 kr." },
      { name: "Coca-Cola Zero", price: "50 kr." },
      { name: "Tuborg Squash", price: "50 kr." },
      { name: "Schweppes Tonic", price: "50 kr." },
      { name: "Danskvand", price: "50 kr." },
      { name: "Danskvand med citrus", price: "50 kr." },
      { name: "Kildevand", price: "50 kr." },
    ],
  },
  {
    title: "Drinks",
    items: [
      { name: "Holger med køllen – Long Island Iced Tea", price: "215 kr." },
      { name: "Kys mig godnat – Filur", price: "95 kr." },
      { name: "Tante Anna – Gin Hass", price: "119 kr." },
      { name: "Glemmer du…? – gin, Southern Comfort og appelsin", price: "119 kr." },
      { name: "Gå med i lunden – Kongen af Danmark", price: "90 kr." },
      { name: "Bagperron – vodka, bananlikør og appelsinjuice", price: "95 kr." },
      { name: "En artig pige – Brandbil", price: "90 kr." },
      { name: "Cleos yndlings – Dark & Stormy", price: "119 kr." },
    ],
  },
  {
    title: "Spritz",
    items: [
      { name: "Aperol Spritz", price: "109 kr." },
      { name: "Limoncello Spritz", price: "109 kr." },
      { name: "Hugo Spritz", price: "105 kr." },
    ],
  },
  {
    title: "Alkoholfrie drinks",
    items: [
      { name: "Alkoholfri Gin & Tonic", price: "95 kr." },
      { name: "Alkoholfri Rom & Cola", price: "95 kr." },
      { name: "Alkoholfri Gin Hass", price: "109 kr." },
    ],
  },
  {
    title: "Rødvin",
    items: [
      { name: "Domaine Astruc Merlot, glas", price: "70 kr." },
      { name: "Domaine Astruc Merlot, flaske", price: "329 kr." },
      { name: "Luigi Righetti Valpolicella, flaske", price: "399 kr." },
      { name: "Maison Sichel Margaux, flaske", price: "599 kr." },
    ],
  },
  {
    title: "Hvidvin",
    items: [
      { name: "Haut Flassac Chardonnay, glas", price: "70 kr." },
      { name: "Haut Flassac Chardonnay, flaske", price: "329 kr." },
      { name: "Villa di Antane Pinot Grigio, flaske", price: "370 kr." },
      { name: "Trimbach Riesling, flaske", price: "465 kr." },
      { name: "Cedrick Bardin Pouilly-Fumé, flaske", price: "499 kr." },
    ],
  },
  {
    title: "Rosévin",
    items: [
      { name: "Château Baron Charcot, glas", price: "70 kr." },
      { name: "Château Baron Charcot, flaske", price: "329 kr." },
      { name: "Famille Perrin Luberon Rosé, flaske", price: "370 kr." },
    ],
  },
  {
    title: "Champagne og mousserende vin",
    items: [
      { name: "Crémant de Bourgogne, Vitteaut-Alberti", price: "499 kr." },
      { name: "Champagne André Clouet Brut Grande Réserve", price: "699 kr." },
      { name: "Champagne Pol Roger Réserve Brut", price: "895 kr." },
    ],
  },
  {
    title: "Varme drikke",
    items: [
      { name: "Kaffe, lille kande pr. person", price: "65 kr." },
      { name: "Te, lille kande pr. person", price: "65 kr." },
      { name: "Irish Coffee med 2 cl whisky", price: "80 kr." },
      { name: "Irish Coffee med 4 cl whisky", price: "110 kr." },
    ],
  },
  {
    title: "Spiritus",
    items: [
      { name: "2 cl gin", price: "55 kr." },
      { name: "2 cl rom", price: "55 kr." },
      { name: "2 cl vodka", price: "55 kr." },
    ],
  },
  {
    title: "Hele flasker spiritus",
    items: [
      { name: "Gin", price: "899 kr." },
      { name: "Rom", price: "899 kr." },
      { name: "Vodka", price: "899 kr." },
    ],
  },
  {
    title: "Snacks",
    items: [{ name: "KIM's chips, minipose", price: "30 kr." }],
  },
];

export default function PriserPage() {
  return (
    <main>
      <nav className="nav">
        <Link href="/" className="logo">
          BAKKENS <span className="logoAccent">HVILE</span>
        </Link>
        <div className="navlinks">
          <Link href="/#priser">Priser</Link>
          <Link href="/book" className="navCta">
            Køb billetter
          </Link>
        </div>
      </nav>

      <section className="section">
        <div className="wrap" style={{ padding: 0, maxWidth: 780 }}>
          <p className="eyebrow" style={{ textAlign: "center" }}>
            Baren
          </p>
          <h1 className="sectionTitle">Drikkekort</h1>
          <p
            style={{
              maxWidth: 620,
              margin: "0 auto 8px",
              textAlign: "center",
              color: "var(--paper-dim)",
              fontSize: 18,
              lineHeight: 1.6,
            }}
          >
            Køber du drikkevarer online sammen med din billet, får du dem{" "}
            <strong style={{ color: "var(--gold)" }}>10% billigere</strong> end
            ved køb i salen.
          </p>

          <div className="drinkList">
            {GROUPS.map((group) => (
              <section className="drinkGroup" key={group.title}>
                <h2 className="drinkGroupTitle">{group.title}</h2>
                {group.items.map((item) => (
                  <div className="drinkRow" key={item.name}>
                    <span className="drinkName">{item.name}</span>
                    <span className="drinkDots" aria-hidden="true" />
                    <span className="drinkPrice">{item.price}</span>
                  </div>
                ))}
              </section>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: 48 }}>
            <Link href="/book" className="ctaGold" style={{ padding: "16px 32px" }}>
              Køb billetter &amp; drikkevarer online
            </Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="brand">BAKKENS HVILE</div>
        <div className="meta">Dyrehavsbakken 38 · 2930 Klampenborg</div>
      </footer>
    </main>
  );
}
