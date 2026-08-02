import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import "./funktioner.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Personalefunktioner — Bakkens Hvile",
  robots: { index: false, follow: false },
};

type Status =
  | "aktiv"
  | "under-test"
  | "ikke-aktiveret"
  | "afventer-viva"
  | "afventer-kasse";

const STATUS_LABEL: Record<Status, string> = {
  aktiv: "Aktiv",
  "under-test": "Under test",
  "ikke-aktiveret": "Ikke aktiveret",
  "afventer-viva": "Afventer Viva-liveopsætning",
  "afventer-kasse": "Afventer lovlig kasseløsning",
};

interface Card {
  href: string;
  title: string;
  desc: string;
  status: Status;
  external?: boolean;
}

export default function FunktionerPage() {
  let session = null;
  try {
    session = verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
  } catch {
    session = null;
  }
  if (!session) redirect("/login?next=/funktioner");

  // Status udledes af driftsflagene, så et kort aldrig lover mere, end
  // opsætningen reelt tillader.
  const tableEnabled = process.env.TABLE_ORDERING_ENABLED === "true";
  const tableLive = process.env.TABLE_ORDERING_LIVE === "true";
  const ticketsLive = process.env.TICKETS_LIVE === "true";
  const vivaLive = process.env.VIVA_ENV === "live";

  const qrOrderingStatus: Status = !tableEnabled
    ? "ikke-aktiveret"
    : !tableLive
    ? "afventer-kasse"
    : !vivaLive
    ? "afventer-viva"
    : "aktiv";

  const ticketStatus: Status = ticketsLive && vivaLive ? "aktiv" : "under-test";

  const internal: Card[] = [
    {
      href: "/bar",
      title: "Barens arbejdsskærm",
      desc: "Se betalte bordordrer, og skift status: Modtaget → Tilberedes → På vej → Leveret.",
      status: qrOrderingStatus,
    },
    {
      href: "/bar",
      title: "Salens tilstand & bordbestilling",
      desc: "Bekræft aftenens forestilling og åbn/luk bordbestilling (Før show, Show, Pause, Lukket). Styres på barskærmen.",
      status: tableEnabled ? "aktiv" : "ikke-aktiveret",
    },
    {
      href: "/admin",
      title: "Bordplan & gæsteplacering",
      desc: "Booking- og ordreoversigt pr. forestilling, forslag til borde, og udskrivning af bordplanen.",
      status: "aktiv",
    },
    {
      href: "/admin/qr",
      title: "Udskriv QR-koder",
      desc: "Generér og print QR-ark til bordene (ét kort pr. bord, kan genprintes enkeltvis).",
      status: "aktiv",
    },
    {
      href: "/admin/fribillet",
      title: "Fribilletter",
      desc: "Udsted en gratis billet uden om betalingen — fx til æresgæster.",
      status: "aktiv",
    },
    {
      href: "/genbestil",
      title: "Genbestilling af tilvalg",
      desc: "Slå en booking op og bestil ekstra drikkevarer. Gæstevendt, men praktisk at kunne åbne fra baren.",
      status: ticketStatus,
    },
  ];

  const public_: Card[] = [
    {
      href: "/",
      title: "Offentlig hjemmeside",
      desc: "Forsiden, som gæsterne ser.",
      status: "aktiv",
      external: false,
    },
    {
      href: "/book",
      title: "Billetkøb",
      desc: "Køb af billetter og tilvalg via Viva.",
      status: ticketStatus,
    },
    {
      href: "/priser",
      title: "Drikkekort & priser",
      desc: "Drikkekortet og prisoversigten.",
      status: "aktiv",
    },
  ];

  return (
    <div className="fn-wrap">
      <header className="fn-top">
        <div>
          <p className="fn-eyebrow">Bakkens Hvile</p>
          <h1>Personalefunktioner</h1>
          <p className="fn-sub">
            Samlet indgang til de interne funktioner. Du er logget ind med den
            fælles personaleadgang.
          </p>
        </div>
        <a className="fn-logout" href="/api/auth/logout">
          Log ud
        </a>
      </header>

      <section aria-labelledby="fn-internal">
        <h2 id="fn-internal" className="fn-section-title">
          Interne funktioner
        </h2>
        <div className="fn-grid">
          {internal.map((c, i) => (
            <FunctionCard key={`i-${i}`} card={c} />
          ))}
        </div>
      </section>

      <section aria-labelledby="fn-public">
        <h2 id="fn-public" className="fn-section-title">
          Offentlige sider
        </h2>
        <div className="fn-grid">
          {public_.map((c, i) => (
            <FunctionCard key={`p-${i}`} card={c} />
          ))}
        </div>
      </section>
    </div>
  );
}

function FunctionCard({ card }: { card: Card }) {
  return (
    <a className="fn-card" href={card.href}>
      <div className="fn-card-head">
        <span className="fn-card-title">{card.title}</span>
        <span className={`fn-badge fn-badge--${card.status}`}>
          {STATUS_LABEL[card.status]}
        </span>
      </div>
      <p className="fn-card-desc">{card.desc}</p>
    </a>
  );
}
