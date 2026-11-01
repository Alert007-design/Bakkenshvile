"use client";

// Selskabets betalingsside: billetterne, der er reserveret, og drikkekortet.
// Beløbene her er kun til visning; serveren beregner alt igen ved betaling.

import { useMemo, useState } from "react";
import {
  addonsTotalDiscountKr,
  discountedAddonUnitKr,
  ADDON_DISCOUNT_LABEL,
} from "@/lib/pricing";
import type { SideVisning } from "@/lib/selskab";
import "./booking.css";

type Vare = { id: string; name: string; price: number; category: string };

function kr(n: number) {
  return n.toLocaleString("da-DK", { minimumFractionDigits: 0 }) + " kr.";
}

const UGEDAGE = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MAANEDER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];
function langDato(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  return `${UGEDAGE[d.getUTCDay()]} den ${d.getUTCDate()}. ${MAANEDER[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export default function SelskabBetalClient({
  visning,
  noegle,
  menu,
}: {
  visning: SideVisning | null;
  noegle: string;
  menu: Vare[];
}) {
  const [antal, setAntal] = useState<Record<string, number>>({});
  const [sender, setSender] = useState(false);
  const [fejl, setFejl] = useState<string | null>(null);

  const grupper = useMemo(() => {
    const m = new Map<string, Vare[]>();
    for (const v of menu) {
      if (!m.has(v.category)) m.set(v.category, []);
      m.get(v.category)!.push(v);
    }
    return Array.from(m.entries());
  }, [menu]);

  if (!visning) {
    return (
      <div className="page">
        <div className="book-hero">
          <div className="eyebrow">Bakkens Hvile</div>
          <h1 className="jubilee-title">Linket virker ikke</h1>
          <p className="book-helper">
            Vi kan ikke finde reservationen. Tjek, at hele linket fra mailen er kommet med, eller
            skriv til kontor@bakkenshvile.dk, så sender vi et nyt.
          </p>
        </div>
      </div>
    );
  }

  const v = visning;
  const rabat = v.rabatAktiv;
  const drikkeLinjer = menu
    .filter((m) => (antal[m.id] || 0) > 0)
    .map((m) => ({ unitKr: m.price, quantity: antal[m.id] }));
  const drikkeBrutto = drikkeLinjer.reduce((s, l) => s + l.unitKr * l.quantity, 0);
  const drikkeRabat = rabat ? addonsTotalDiscountKr(drikkeLinjer) : 0;
  const billetterKr = Math.round(v.billetterOre / 100);
  const iAlt = billetterKr + drikkeBrutto - drikkeRabat;

  function saet(id: string, delta: number) {
    setAntal((p) => ({ ...p, [id]: Math.max(0, (p[id] || 0) + delta) }));
  }

  async function betal() {
    setFejl(null);
    setSender(true);
    try {
      const res = await fetch("/api/selskab/betal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingNo: v.bookingNo,
          noegle,
          addons: Object.entries(antal)
            .filter(([, n]) => n > 0)
            .map(([addonId, quantity]) => ({ addonId, quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Betalingen kunne ikke startes.");
      window.location.href = data.url;
    } catch (e) {
      setFejl(e instanceof Error ? e.message : "Betalingen kunne ikke startes.");
      setSender(false);
    }
  }

  const lukket =
    v.tilstand === "betalt"
      ? "Billetterne er betalt. I har fået billetten på mail. Vi glæder os til at se jer."
      : v.tilstand === "annulleret"
      ? "Reservationen er annulleret. Skriv til kontor@bakkenshvile.dk, hvis I stadig vil komme."
      : v.tilstand === "frist_overskredet"
      ? "Fristen for betaling er overskredet. Skriv til kontor@bakkenshvile.dk, hvis I stadig vil komme."
      : null;

  return (
    <div className="page">
      <div className="book-hero book-hero--compact">
        <div className="eyebrow">Bakkens Hvile · Reservation {v.bookingNo}</div>
        <h1 className="jubilee-title" style={{ fontSize: "clamp(26px, 4vw, 38px)" }}>
          {v.kundeNavn ? `Hej ${v.kundeNavn}` : "Jeres reservation"}
        </h1>
        <div className="hero-meta">
          <span>
            <b>Show</b> {v.showTitle}
          </span>
          <span>
            <b>Dato</b> {langDato(v.showDateIso)}
          </span>
          <span>
            <b>Kl.</b> {v.showTime}
          </span>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Jeres billetter</div>
        <div className="section-sub">
          {lukket ? "" : `Betal senest ${langDato(v.frist)}. Derefter annulleres reservationen.`}
        </div>
        <div className="notice">
          {v.linjer.map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>
                {l.quantity} × {l.description}
              </span>
              <span>{kr(Math.round(l.amountSubtotalOre / 100))}</span>
            </div>
          ))}
        </div>
      </div>

      {lukket ? (
        <div className="section">
          <div className="notice" role="status">
            {lukket}
          </div>
        </div>
      ) : (
        <>
          {grupper.length > 0 && (
            <div className="section">
              <div className="section-title">Drikkevarer til bordet (valgfrit)</div>
              <div className="section-sub">
                Alle priser er inklusive 25 % moms.
                {rabat ? " Ved bestilling her får I 10 % onlinerabat på drikkevarerne." : ""}
              </div>
              <div className="addon-groups">
                {grupper.map(([kategori, varer]) => (
                  <div className="addon-group" key={kategori}>
                    <h4>{kategori}</h4>
                    {varer.map((a) => (
                      <div className="addon-item" key={a.id}>
                        <span className="addon-name">{a.name}</span>
                        <div className="addon-controls">
                          <span className="addon-price">
                            {rabat ? (
                              <>
                                <span className="addon-price-full">{kr(a.price)}</span>{" "}
                                <span className="addon-price-discounted">
                                  {kr(discountedAddonUnitKr(a.price))}
                                </span>
                              </>
                            ) : (
                              kr(a.price)
                            )}
                          </span>
                          <div className="stepper">
                            <button onClick={() => saet(a.id, -1)} disabled={!antal[a.id]} aria-label={`Fjern ${a.name}`}>
                              −
                            </button>
                            <span>{antal[a.id] || 0}</span>
                            <button onClick={() => saet(a.id, 1)} aria-label={`Tilføj ${a.name}`}>
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {fejl && (
            <div className="section">
              <div className="error-msg" role="alert">
                {fejl}
              </div>
            </div>
          )}

          <div className="summary">
            <div>
              <div className="summary-line">
                <span>Billetter</span>
                <span>{kr(billetterKr)}</span>
              </div>
              {drikkeBrutto > 0 && (
                <div className="summary-line">
                  <span>Drikkevarer</span>
                  <span>{kr(drikkeBrutto)}</span>
                </div>
              )}
              {drikkeRabat > 0 && (
                <div className="summary-discount">
                  <span>{ADDON_DISCOUNT_LABEL}</span>
                  <span className="summary-discount-amount">−{kr(drikkeRabat)}</span>
                </div>
              )}
              <div className="summary-total">{kr(iAlt)}</div>
            </div>
            <button className="submit-btn" onClick={betal} disabled={sender}>
              {sender ? "Sender..." : "Gå til betaling"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
