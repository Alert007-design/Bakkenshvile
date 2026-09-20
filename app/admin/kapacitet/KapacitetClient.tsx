"use client";

// Overblikket over pladser. Henter alt fra /api/admin/kapacitet, som er bag
// personalelogin. Siden ændrer intet af sig selv — kun de to knapper gør noget:
// importen af gamle bookinger og den manuelle placering af en enkelt booking.

import { useCallback, useEffect, useState } from "react";

type Kategori = {
  noegle: string;
  navn: string;
  kapacitet: number;
  taget: number;
  tilbage: number;
  genberegnet: number;
};

type Forestilling = {
  id: string;
  titel: string;
  dato: string;
  tid: string;
  manueltUdsolgt: boolean;
  kategorier: Kategori[];
};

type Uplaceret = {
  bookingId: string;
  bookingNo: string;
  showId: string;
  dato: string;
  kundenavn: string;
  tekst: string;
  detalje: string;
  aarsag: string;
};

type Oversigt = {
  forestillinger: Forestilling[];
  manglerKategori: { id: string; navn: string; prisgruppe: string }[];
};

/** Gennemgangen af gamle bookinger — hentes for sig, fordi den tager tid. */
type GamleBookinger = {
  klarTilImport: number;
  uplacerede: Uplaceret[];
};

const KATEGORI_VALG = [
  { vaerdi: "aplusForrest", tekst: "A+ forrest (1.-3. række)" },
  { vaerdi: "aplusBagerst", tekst: "A+ bagerst (4.-6. række)" },
  { vaerdi: "a", tekst: "A (7.-9. række)" },
  { vaerdi: "b", tekst: "B (10. række)" },
];

// Admin-siderne vises oven på sitets mørke tema. Uden en eksplicit hvid
// fuldside-baggrund står den mørke tekst på mørkeblå og kan ikke læses.
// Samme opbygning som /admin/fribillet.
const sideWrap: React.CSSProperties = {
  background: "#fff",
  color: "#1a1a16",
  minHeight: "100vh",
};

const side: React.CSSProperties = {
  maxWidth: 1000,
  margin: "0 auto",
  padding: "32px 24px 80px",
  fontFamily: "system-ui, sans-serif",
  color: "#1a1a16",
  // Også hvid her, ikke kun på den yderste indpakning. Så står teksten på hvid,
  // selv hvis den yderste baggrund af en eller anden grund ikke slår igennem.
  background: "#fff",
};

// Overskrift og brødtekst sætter deres farve SELV i stedet for at arve den.
// En arvet farve taber nemlig til enhver regel, der rammer elementet direkte —
// uanset hvor lav dens specificitet er. Med farven skrevet på elementet kan
// hverken en senere global regel, en browserudvidelse eller browserens egen
// mørke tilstand gøre teksten ulæselig.
const overskrift: React.CSSProperties = {
  fontSize: 24,
  margin: "0 0 6px",
  color: "#1a1a16",
};

const broedtekst: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.6,
  margin: "0 0 24px",
  color: "#1a1a16",
};

const kort: React.CSSProperties = {
  border: "1px solid #d8d3c2",
  borderRadius: 6,
  padding: 16,
  marginBottom: 18,
  background: "#fff",
};

const celle: React.CSSProperties = {
  padding: "7px 10px",
  borderBottom: "1px solid #eee",
  fontSize: 14,
};

export default function KapacitetClient({ csrf }: { csrf: string }) {
  const [data, setData] = useState<Oversigt | null>(null);
  const [gamle, setGamle] = useState<GamleBookinger | null>(null);
  const [gamleFejl, setGamleFejl] = useState<string | null>(null);
  const [fejl, setFejl] = useState<string | null>(null);
  const [arbejder, setArbejder] = useState(false);
  const [besked, setBesked] = useState<string | null>(null);
  const [valg, setValg] = useState<Record<string, string>>({});

  // Overblikket. Kommer hurtigt: alle tal hentes fra vores egen database.
  const hent = useCallback(async () => {
    setFejl(null);
    try {
      const res = await fetch("/api/admin/kapacitet", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kunne ikke hente oversigten.");
      setData(json);
    } catch (e) {
      setFejl(e instanceof Error ? e.message : "Noget gik galt");
    }
  }, []);

  // Gennemgangen af gamle bookinger. Kræver ét Airtable-opslag pr. booking og
  // tager derfor tid — derfor hentes den for sig, EFTER at overblikket er vist.
  const hentGamle = useCallback(async () => {
    setGamleFejl(null);
    setGamle(null);
    try {
      const res = await fetch("/api/admin/kapacitet?gamle=1", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kunne ikke gennemgå bookinger.");
      setGamle(json);
    } catch (e) {
      setGamleFejl(e instanceof Error ? e.message : "Noget gik galt");
    }
  }, []);

  useEffect(() => {
    hent();
  }, [hent]);

  // Først når overblikket står på skærmen, går den langsomme gennemgang i gang.
  useEffect(() => {
    if (data && gamle === null && gamleFejl === null) hentGamle();
  }, [data, gamle, gamleFejl, hentGamle]);

  async function send(krop: Record<string, unknown>, svartekst: (d: any) => string) {
    setArbejder(true);
    setBesked(null);
    setFejl(null);
    try {
      const res = await fetch("/api/admin/kapacitet", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify(krop),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Noget gik galt");
      setBesked(svartekst(json));
      await hent();
      await hentGamle();
    } catch (e) {
      setFejl(e instanceof Error ? e.message : "Noget gik galt");
    } finally {
      setArbejder(false);
    }
  }

  if (fejl && !data) {
    return (
      <div style={sideWrap}>
        <main style={side}>
          <h1 style={{ ...overskrift, margin: "0 0 12px" }}>Pladser og kapacitet</h1>
          <p style={{ color: "#a00", fontSize: 15 }} role="alert">{fejl}</p>
        </main>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={sideWrap}>
        <main style={side}>
          <h1 style={{ ...overskrift, margin: "0 0 12px" }}>Pladser og kapacitet</h1>
          <p style={{ ...broedtekst, fontSize: 16, margin: 0 }} role="status">
            Henter tallene fra pladsbogen …
          </p>
        </main>
      </div>
    );
  }

  return (
    <div style={sideWrap}>
    <main style={side}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
          fontSize: 14,
        }}
      >
        <a href="/funktioner" style={{ color: "#0d3b2e", fontWeight: 600 }}>
          ← Funktioner
        </a>
        <a href="/api/auth/logout" style={{ color: "#8a1f2b", fontWeight: 600 }}>
          Log ud
        </a>
      </div>
      <h1 style={overskrift}>Pladser og kapacitet</h1>
      <p style={broedtekst}>
        Standardkapaciteten er 58 + 60 + 42 + 12 = 172 billetter. Vil du ændre
        tallet for en bestemt forestilling, gør du det i Airtable på selve
        forestillingen — felterne hedder &quot;Kapacitet …&quot;. Et tomt felt
        betyder, at standardtallet gælder.
      </p>

      {fejl && <p style={{ color: "#a00" }} role="alert">{fejl}</p>}
      {besked && (
        <p
          style={{
            padding: 12,
            background: "#f2f8f4",
            border: "1px solid #0d3b2e",
            borderRadius: 6,
          }}
          role="status"
        >
          {besked}
        </p>
      )}

      {/* Billettyper uden kapacitetskategori — de kan ikke sælges. */}
      {data.manglerKategori.length > 0 && (
        <div
          style={{ ...kort, border: "2px solid #8a1f2b", background: "#fdf3f4" }}
          role="alert"
        >
          <strong>
            {data.manglerKategori.length} billettype
            {data.manglerKategori.length === 1 ? "" : "r"} mangler
            kapacitetskategori og kan ikke sælges
          </strong>
          <p style={{ margin: "6px 0", fontSize: 14, lineHeight: 1.6 }}>
            Åbn Airtable, gå til tabellen TicketTypes og udfyld feltet
            &quot;Kapacitetskategori&quot; på disse billettyper:
          </p>
          <ul style={{ margin: "0 0 0 18px", fontSize: 14, lineHeight: 1.7 }}>
            {data.manglerKategori.map((t) => (
              <li key={t.id}>
                {t.navn}
                {t.prisgruppe ? ` — prisgruppe ${t.prisgruppe}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Import af gamle bookinger. */}
      <div style={kort}>
        <strong>Bookinger fra før dette system</strong>
        <p style={{ margin: "6px 0 10px", fontSize: 14, lineHeight: 1.6 }}>
          {gamleFejl ? (
            <span style={{ color: "#a00" }}>{gamleFejl}</span>
          ) : !gamle ? (
            <span role="status">
              Gennemgår bookingerne i Airtable … Det tager et øjeblik, fordi
              hver booking skal slås op for sig.
            </span>
          ) : gamle.klarTilImport > 0 ? (
            `${gamle.klarTilImport} betalte booking${
              gamle.klarTilImport === 1 ? "" : "er"
            } på kommende forestillinger er endnu ikke talt med. Tryk for at tælle dem med. Knappen kan trykkes flere gange uden at tælle dobbelt.`
          ) : (
            "Alle betalte bookinger på kommende forestillinger er talt med."
          )}
        </p>
        <button
          type="button"
          onClick={() =>
            send({ handling: "importer" }, (d) =>
              `${d.importeret} booking${d.importeret === 1 ? "" : "er"} talt med.${
                d.kunneIkkePlaceres
                  ? ` ${d.kunneIkkePlaceres} kunne ikke placeres — se listen nedenfor.`
                  : ""
              }`
            )
          }
          disabled={arbejder || !gamle}
          style={{
            padding: "9px 18px",
            background: "#0d3b2e",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            cursor: arbejder || !gamle ? "not-allowed" : "pointer",
            opacity: arbejder || !gamle ? 0.5 : 1,
          }}
        >
          Indlæs allerede solgte billetter
        </button>
      </div>

      {/* Bookinger, der ikke kunne placeres entydigt. */}
      {gamle && gamle.uplacerede.length > 0 && (
        <div style={{ ...kort, border: "2px solid #c9a227" }}>
          <strong>
            {gamle.uplacerede.length} booking
            {gamle.uplacerede.length === 1 ? "" : "er"} kan ikke placeres
            automatisk
          </strong>
          <p style={{ margin: "6px 0 12px", fontSize: 14, lineHeight: 1.6 }}>
            De er ikke talt med. Vælg selv priskategorien for hver enkelt — så
            bliver den talt med med det samme.
          </p>
          {gamle.uplacerede.map((u) => (
            <div
              key={u.bookingId}
              style={{
                borderTop: "1px solid #eee",
                padding: "10px 0",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              <div>
                <strong>{u.bookingNo || "(uden bookingnummer)"}</strong>
                {u.kundenavn ? ` — ${u.kundenavn}` : ""} — {u.dato}
              </div>
              <div style={{ color: "#6b6858" }}>
                Står som: <code>{u.tekst || "(tomt)"}</code>
              </div>
              <div style={{ color: "#8a1f2b" }}>{u.aarsag}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select
                  aria-label={`Priskategori for ${u.bookingNo}`}
                  value={valg[u.bookingId] ?? ""}
                  onChange={(e) =>
                    setValg((p) => ({ ...p, [u.bookingId]: e.target.value }))
                  }
                  style={{ padding: 6, fontSize: 14 }}
                >
                  <option value="">Vælg priskategori …</option>
                  {KATEGORI_VALG.map((k) => (
                    <option key={k.vaerdi} value={k.vaerdi}>
                      {k.tekst}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  placeholder="Antal"
                  aria-label={`Antal billetter for ${u.bookingNo}`}
                  value={valg[`${u.bookingId}-antal`] ?? ""}
                  onChange={(e) =>
                    setValg((p) => ({
                      ...p,
                      [`${u.bookingId}-antal`]: e.target.value,
                    }))
                  }
                  style={{ padding: 6, fontSize: 14, width: 80 }}
                />
                <button
                  type="button"
                  disabled={
                    arbejder ||
                    !valg[u.bookingId] ||
                    !Number(valg[`${u.bookingId}-antal`])
                  }
                  onClick={() =>
                    send(
                      {
                        handling: "placer",
                        bookingId: u.bookingId,
                        showId: u.showId,
                        kategori: valg[u.bookingId],
                        antal: Number(valg[`${u.bookingId}-antal`]),
                      },
                      () => "Bookingen er talt med."
                    )
                  }
                  style={{
                    padding: "6px 14px",
                    background: "#0d3b2e",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Tæl med
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selve overblikket pr. forestilling. */}
      {data.forestillinger.map((f) => (
        <div style={kort} key={f.id}>
          <div style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: 16 }}>{f.titel}</strong> — {f.dato}
            {f.tid ? ` kl. ${f.tid}` : ""}
            {f.manueltUdsolgt && (
              <span style={{ color: "#8a1f2b", marginLeft: 8 }}>
                (markeret udsolgt i Airtable)
              </span>
            )}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...celle, textAlign: "left" }}>Priskategori</th>
                <th style={{ ...celle, textAlign: "right" }}>Kapacitet</th>
                <th style={{ ...celle, textAlign: "right" }}>
                  Solgt/reserveret
                </th>
                <th style={{ ...celle, textAlign: "right" }}>Tilbage</th>
              </tr>
            </thead>
            <tbody>
              {f.kategorier.map((k) => (
                <tr key={k.noegle}>
                  <td style={celle}>{k.navn}</td>
                  <td style={{ ...celle, textAlign: "right" }}>{k.kapacitet}</td>
                  <td style={{ ...celle, textAlign: "right" }}>
                    {k.taget}
                    {/* Er pladsbogens tal og linjerne uenige, vises det — så
                        en fejl er synlig i stedet for skjult. */}
                    {k.genberegnet !== k.taget && (
                      <span style={{ color: "#8a1f2b" }}>
                        {" "}
                        (linjerne siger {k.genberegnet})
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      ...celle,
                      textAlign: "right",
                      fontWeight: k.tilbage === 0 ? 700 : 400,
                      color: k.tilbage === 0 ? "#8a1f2b" : undefined,
                    }}
                  >
                    {k.tilbage === 0 ? "Udsolgt" : k.tilbage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </main>
    </div>
  );
}
