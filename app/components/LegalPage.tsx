import Link from "next/link";
import { COMPANY, type LegalDoc } from "@/lib/legal-content";

// Fælles, responsiv visning af en juridisk side i sidens eget design.
// Bruges af både handelsbetingelser og privatlivspolitik.
export default function LegalPage({ doc }: { doc: LegalDoc }) {
  const year = new Date().getFullYear();

  return (
    <main>
      <nav className="nav">
        <Link href="/" className="logo">
          BAKKENS <span className="logoAccent">HVILE</span>
        </Link>
        <div className="navlinks">
          <Link href="/#kontakt">Kontakt</Link>
          <Link href="/book" className="navCta">
            Køb billetter
          </Link>
        </div>
      </nav>

      <section className="section">
        <div className="wrap legalWrap">
          <p className="eyebrow">Bakkens Hvile</p>
          <h1 className="legalTitle">{doc.title}</h1>
          <p className="legalUpdated">{doc.updatedNote}</p>

          {doc.sections.map((sec) => (
            <section className="legalSection" id={sec.id} key={sec.id}>
              <h2 className="legalHeading">{sec.heading}</h2>
              {sec.blocks.map((block, i) => {
                if (block.type === "p") {
                  return <p key={i} className="legalP">{block.text}</p>;
                }
                if (block.type === "ul") {
                  return (
                    <ul key={i} className="legalList">
                      {block.items.map((it, j) => (
                        <li key={j}>{it}</li>
                      ))}
                    </ul>
                  );
                }
                // review: markeret som afventende juridisk/faktuel godkendelse.
                return (
                  <p key={i} className="legalReview">
                    <span className="legalReviewTag">Afventer juridisk gennemgang</span>
                    {block.text}
                  </p>
                );
              })}
            </section>
          ))}

          <div className="legalContact">
            <p className="legalP">
              {COMPANY.name} · {COMPANY.address} · CVR {COMPANY.cvr}
            </p>
            <p className="legalP">
              E-mail: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
              {COMPANY.phone ? ` · Telefon: ${COMPANY.phone}` : ""}
            </p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="brand">BAKKENS HVILE</div>
        <div className="footerLinks">
          <Link href="/handelsbetingelser">Handelsbetingelser</Link>
          <Link href="/privatlivspolitik">Privatlivspolitik</Link>
        </div>
        <div className="meta">
          Dyrehavsbakken 38 · 2930 Klampenborg · © {year}
        </div>
      </footer>
    </main>
  );
}
