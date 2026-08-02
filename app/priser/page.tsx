import Link from "next/link";
import type { Metadata } from "next";
import { getMenuGroups } from "@/lib/menu";
import { formatKroner } from "@/lib/money";
import { isOrderingEnabled } from "@/lib/table-ordering-config";

export const metadata: Metadata = {
  title: "Drikkekort & priser — Bakkens Hvile",
  description:
    "Se hele drikkekortet i Bakkens Hvile: øl, vin, drinks, spiritus og snacks. Bestil online sammen med billetten senest kl. 12.00 på forestillingsdagen og få 10 % rabat.",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PriserPage() {
  // Én kilde: drikkekortet læses fra Airtable (AddOns) og viser fulde
  // salpriser — de samme priser som på det fysiske kort og ved tjeneren.
  let groups: Awaited<ReturnType<typeof getMenuGroups>> = [];
  try {
    groups = await getMenuGroups();
  } catch {
    groups = [];
  }

  // QR-bestilling nævnes kun, når funktionen reelt er aktiveret.
  const qrOrdering = isOrderingEnabled();

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
            Priserne herunder er de almindelige priser — ved bestilling hos
            tjeneren{qrOrdering ? ", via QR-koden ved bordet" : ""} og på selve
            forestillingsdagen efter kl. 12.00. Bestiller du drikkevarer{" "}
            <strong style={{ color: "var(--gold)" }}>online</strong> sammen med
            billetten senest{" "}
            <strong style={{ color: "var(--gold)" }}>
              kl. 12.00 på forestillingsdagen
            </strong>
            , får du <strong style={{ color: "var(--gold)" }}>10 % rabat</strong>.
          </p>

          {groups.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--muted)", marginTop: 40 }}>
              Drikkekortet indlæses ikke lige nu. Prøv igen om lidt.
            </p>
          ) : (
            <div className="drinkList">
              {groups.map((group) => (
                <section className="drinkGroup" key={group.group}>
                  <h2 className="drinkGroupTitle">{group.group}</h2>
                  {group.items.map((item) => (
                    <div className="drinkRow" key={item.id}>
                      <span className="drinkName">{item.name}</span>
                      <span className="drinkDots" aria-hidden="true" />
                      <span className="drinkPrice">{formatKroner(item.unitPriceOre)}</span>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: 48 }}>
            <Link href="/book" className="ctaGold" style={{ padding: "16px 32px" }}>
              Køb billetter &amp; drikkevarer online
            </Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="brand">BAKKENS HVILE</div>
        <div className="footerLinks">
          <Link href="/handelsbetingelser">Handelsbetingelser</Link>
          <Link href="/privatlivspolitik">Privatlivspolitik</Link>
        </div>
        <div className="meta">Dyrehavsbakken 38 · 2930 Klampenborg</div>
      </footer>
    </main>
  );
}
