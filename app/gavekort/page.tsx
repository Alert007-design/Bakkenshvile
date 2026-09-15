import type { Metadata } from "next";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import JsonLd from "../components/JsonLd";
import { breadcrumbs, pageMetadata } from "@/lib/seo";
import GavekortForm from "./GavekortForm";

export const metadata: Metadata = pageMetadata("gavekort");

// Købsside for gavekort (fase 1): frit beløb, betaling via Viva, gavekortet
// sendes til modtageren på e-mail med en unik kode. Indløsning i fase 1 er
// manuel (e-mail eller i døren).
export default function GavekortPage() {
  return (
    <main>
      <JsonLd
        data={breadcrumbs([
          ["Forside", "/"],
          ["Gavekort", "/gavekort"],
        ])}
      />
      <SiteNav />

      <section className="section">
        <div className="prose">
          <p className="eyebrow">Gavekort</p>
          <h1>Gavekort til Bakkens Hvile</h1>
          <p className="lead">
            Giv en aften med sang, satire og godt selskab i Danmarks ældste
            cabaret. Du vælger beløbet – vi sørger for resten.
          </p>
          <p>
            Gavekortet sendes som e-mail til modtageren med en personlig kode og
            gælder i 3 år. Det indløses ved bestilling via kontor@bakkenshvile.dk
            eller ved fremvisning i døren. Alle beløb er inkl. moms.
          </p>
        </div>

        <div className="prose" style={{ marginTop: 24 }}>
          <GavekortForm />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
