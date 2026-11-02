"use client";

// Salgsstatus: én linje pr. kommende forestilling med solgt, reserveret og
// til salg. Henter fra /api/admin/salgsstatus og ændrer intet.

import { useEffect, useState } from "react";

type Tal = { kapacitet: number; solgt: number; reserveret: number; tilSalg: number };

type Forestilling = {
  id: string;
  titel: string;
  dato: string;
  tid: string;
  manueltUdsolgt: boolean;
  kategorier: Record<string, Tal>;
  iAlt: Tal;
};

type Svar = {
  kategorier: { noegle: string; navn: string }[];
  forestillinger: Forestilling[];
  ubetalteFejl: boolean;
};

const DATO = new Intl.DateTimeFormat("da-DK", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/Copenhagen",
});
const MAANED = new Intl.DateTimeFormat("da-DK", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Copenhagen",
});

function somDato(dato: string): Date {
  return new Date(`${dato}T12:00:00Z`);
}

const GROEN = "#0d3b2e";
const ROED = "#b3261e";
const GUL = "#8a6d00";

const celle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

function KategoriCelle({ t }: { t: Tal }) {
  const farve = t.tilSalg === 0 ? ROED : t.tilSalg <= 5 ? GUL : GROEN;
  return (
    <td style={{ ...celle, textAlign: "right" }}>
      <div style={{ fontWeight: 700, color: farve, fontSize: 16 }}>
        {t.tilSalg === 0 ? "Udsolgt" : t.tilSalg}
      </div>
      <div style={{ color: "#888", fontSize: 11 }}>
        {t.solgt} solgt{t.reserveret > 0 ? ` · ${t.reserveret} res.` : ""} af {t.kapacitet}
      </div>
    </td>
  );
}

export default function SalgsstatusClient() {
  const [data, setData] = useState<Svar | null>(null);
  const [fejl, setFejl] = useState("");

  useEffect(() => {
    fetch("/api/admin/salgsstatus", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Salgsstatus kunne ikke hentes.");
        setData(json as Svar);
      })
      .catch((e: Error) => setFejl(e.message));
  }, []);

  const samlet = data?.forestillinger.reduce(
    (s, f) => ({
      kapacitet: s.kapacitet + f.iAlt.kapacitet,
      solgt: s.solgt + f.iAlt.solgt,
      reserveret: s.reserveret + f.iAlt.reserveret,
      tilSalg: s.tilSalg + f.iAlt.tilSalg,
    }),
    { kapacitet: 0, solgt: 0, reserveret: 0, tilSalg: 0 }
  );

  let sidsteMaaned = "";

  return (
    <div style={{ background: "#fff", color: "#1a1a16", minHeight: "100vh", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16, fontSize: 14 }}>
          <a href="/admin" style={{ color: GROEN, fontWeight: 600 }}>← Bordplan</a>
          <a href="/admin/kapacitet" style={{ color: GROEN, fontWeight: 600 }}>Ret antal billetter</a>
        </div>
        <h1 style={{ margin: "0 0 6px" }}>Salgsstatus</h1>
        <p style={{ color: "#555", fontSize: 14, marginTop: 0 }}>
          Alle kommende forestillinger. Det store tal er antal billetter til salg i kategorien. Solgt er betalte
          billetter og fribilletter. Reserveret er billetter, der holdes uden at være betalt: store selskaber, køb midt
          i betalingen og gamle bestillinger, der mangler betaling. Klik på en dato for at åbne bordplanen.
        </p>

        {fejl && <p style={{ color: ROED }}>{fejl}</p>}
        {!data && !fejl && <p style={{ color: "#999" }}>Henter…</p>}
        {data?.ubetalteFejl && (
          <p style={{ color: ROED, fontSize: 14 }}>
            Bestillinger fra det gamle system, der mangler betaling, kunne ikke hentes lige nu. De tælles derfor
            som solgt. Prøv at genindlæse siden.
          </p>
        )}

        {data && samlet && (
          <>
            <p style={{ fontSize: 15 }}>
              I alt: <strong>{samlet.solgt}</strong> solgt, <strong>{samlet.reserveret}</strong> reserveret og{" "}
              <strong>{samlet.tilSalg}</strong> til salg på {data.forestillinger.length} forestillinger.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f6f3ea" }}>
                    <th style={{ ...celle, textAlign: "left" }}>Forestilling</th>
                    {data.kategorier.map((k) => (
                      <th key={k.noegle} style={{ ...celle, textAlign: "right", whiteSpace: "normal" }}>
                        {k.navn}
                      </th>
                    ))}
                    <th style={{ ...celle, textAlign: "right" }}>Solgt</th>
                    <th style={{ ...celle, textAlign: "right" }}>Reserveret</th>
                    <th style={{ ...celle, textAlign: "right" }}>Til salg</th>
                  </tr>
                </thead>
                <tbody>
                  {data.forestillinger.map((f) => {
                    const maaned = MAANED.format(somDato(f.dato));
                    const ny = maaned !== sidsteMaaned;
                    sidsteMaaned = maaned;
                    return [
                      ny && (
                        <tr key={`m-${f.id}`}>
                          <td
                            colSpan={data.kategorier.length + 4}
                            style={{ padding: "14px 8px 4px", fontWeight: 700, textTransform: "capitalize" }}
                          >
                            {maaned}
                          </td>
                        </tr>
                      ),
                      <tr key={f.id}>
                        <td style={celle}>
                          <a href={`/admin?show=${encodeURIComponent(f.id)}`} style={{ color: GROEN, fontWeight: 600 }}>
                            {DATO.format(somDato(f.dato))} kl. {f.tid}
                          </a>
                          {f.manueltUdsolgt && (
                            <div style={{ color: ROED, fontSize: 11, fontWeight: 700 }}>Sat til udsolgt</div>
                          )}
                        </td>
                        {data.kategorier.map((k) => (
                          <KategoriCelle key={k.noegle} t={f.kategorier[k.noegle]} />
                        ))}
                        <td style={{ ...celle, textAlign: "right" }}>{f.iAlt.solgt}</td>
                        <td style={{ ...celle, textAlign: "right", color: f.iAlt.reserveret ? GUL : "#999" }}>
                          {f.iAlt.reserveret}
                        </td>
                        <td style={{ ...celle, textAlign: "right", fontWeight: 700, color: f.iAlt.tilSalg ? GROEN : ROED }}>
                          {f.iAlt.tilSalg === 0 ? "Udsolgt" : f.iAlt.tilSalg}
                        </td>
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
