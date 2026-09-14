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
            Forær en aften med skønsang og syngende samfundssatire på
            Dyrehavsbakken. Du vælger selv beløbet.
          </p>
          <p>
            Gavekortet sendes på e-mail til modtageren med en unik kode og er
            gyldigt i 3 år fra købsdatoen. Det indløses ved at skrive til
            kontor@bakkenshvile.dk med koden eller vise koden i døren. Alle beløb
            er inkl. moms.
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
