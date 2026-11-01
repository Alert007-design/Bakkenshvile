"use client";

// Store selskaber med betalingsfrist: opret en reservation og se listen.
// Priser vises kun til orientering; serveren beregner alt igen.

import { useCallback, useEffect, useMemo, useState } from "react";

type Show = { id: string; title: string; date: string; time: string; priceGroup: string };
type TicketType = {
  id: string;
  category: string;
  priceGroup: string;
  kapacitetskategori: string | null;
  prisKr: number;
};
type Selskab = {
  bookingId: string;
  bookingNo: string;
  showId: string;
  kunde: string;
  email: string;
  antal: number;
  frist: string;
  paamindelseSendt: boolean;
  tilstand: string;
};

const UGEDAGE = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MAANEDER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];
function dato(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  return `${UGEDAGE[d.getUTCDay()]} ${d.getUTCDate()}. ${MAANEDER[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const pageWrap: React.CSSProperties = { background: "#fff", color: "#1a1a16", minHeight: "100vh" };
const box: React.CSSProperties = { maxWidth: 760, margin: "0 auto", padding: 24, fontFamily: "sans-serif", color: "#1a1a16" };
const label: React.CSSProperties = { display: "block", fontWeight: 600, margin: "16px 0 6px" };
const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 15,
  boxSizing: "border-box",
};
const knap: React.CSSProperties = {
  padding: "10px 20px",
  background: "#0d3b2e",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 15,
  cursor: "pointer",
};

export default function SelskabClient({
  shows,
  ticketTypes,
  csrf,
  idag,
}: {
  shows: Show[];
  ticketTypes: TicketType[];
  csrf: string;
  idag: string;
}) {
  const [showId, setShowId] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [tilbage, setTilbage] = useState<Record<string, number> | null>(null);
  const [navn, setNavn] = useState("");
  const [firma, setFirma] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [frist, setFrist] = useState("");
  const [note, setNote] = useState("");
  const [arbejder, setArbejder] = useState(false);
  const [fejl, setFejl] = useState<string | null>(null);
  const [oversalg, setOversalg] = useState<{ advarsel: string; detaljer: string[] } | null>(null);
  const [resultat, setResultat] = useState<{
    bookingNo: string;
    ticketBreakdown: string;
    billetterKr: number;
    emailed: boolean;
    betalingsside: string;
  } | null>(null);
  const [liste, setListe] = useState<Selskab[] | null>(null);

  const show = shows.find((s) => s.id === showId) ?? null;
  const synlige = useMemo(
    () => (show ? ticketTypes.filter((t) => t.priceGroup === show.priceGroup) : []),
    [ticketTypes, show]
  );
  const antal = (id: string) => {
    const n = Number(qty[id]);
    return Number.isInteger(n) && n > 0 ? n : 0;
  };
  const iAlt = synlige.reduce((s, t) => s + antal(t.id), 0);
  const kr = synlige.reduce((s, t) => s + antal(t.id) * t.prisKr, 0);

  const hentListe = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/selskab", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setListe(data.selskaber);
    } catch {
      /* listen er ikke afgørende for at kunne oprette */
    }
  }, []);
  useEffect(() => {
    hentListe();
  }, [hentListe]);

  // Ledige pladser i det almindelige system for den valgte forestilling.
  useEffect(() => {
    setTilbage(null);
    if (!showId) return;
    fetch(`/api/billetter-tilbage?showId=${encodeURIComponent(showId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTilbage(d.tilbage ?? null))
      .catch(() => setTilbage(null));
  }, [showId]);

  async function opret(bekraeft = false) {
    setFejl(null);
    setResultat(null);
    if (!bekraeft) setOversalg(null);
    if (!show) return setFejl("Vælg en forestilling.");
    if (iAlt === 0) return setFejl("Skriv antal billetter.");
    if (!navn.trim()) return setFejl("Skriv kundens navn.");
    if (!email.trim()) return setFejl("Skriv kundens e-mail. Linket til betaling sendes dertil.");
    if (!frist) return setFejl("Vælg en sidste betalingsfrist.");
    setArbejder(true);
    try {
      const res = await fetch("/api/admin/selskab", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({
          handling: "opret",
          showId: show.id,
          tickets: synlige
            .filter((t) => antal(t.id) > 0)
            .map((t) => ({ ticketTypeId: t.id, quantity: antal(t.id) })),
          customer: { name: navn.trim(), email: email.trim(), phone: telefon.trim(), company: firma.trim() },
          frist,
          note: note.trim() || undefined,
          bekraeftOversalg: bekraeft || undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data?.kraeverBekraeftelse) {
        setOversalg({ advarsel: String(data.advarsel ?? ""), detaljer: (data.detaljer ?? []).map(String) });
        return;
      }
      if (!res.ok) throw new Error(data.error || "Noget gik galt");
      setResultat(data);
      setOversalg(null);
      setQty({});
      setNavn("");
      setFirma("");
      setEmail("");
      setTelefon("");
      setFrist("");
      setNote("");
      hentListe();
    } catch (e) {
      setFejl(e instanceof Error ? e.message : "Noget gik galt");
    } finally {
      setArbejder(false);
    }
  }

  return (
    <div style={pageWrap}>
      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14 }}>
          <a href="/funktioner" style={{ color: "#0d3b2e", fontWeight: 600 }}>← Funktioner</a>
          <a href="/api/auth/logout" style={{ color: "#8a1f2b", fontWeight: 600 }}>Log ud</a>
        </div>
        <h1 style={{ fontSize: 24 }}>Store selskaber</h1>
        <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6 }}>
          Reservér billetter til et selskab med en sidste betalingsfrist. Pladserne holdes til
          fristen. Kunden får en mail med et link, hvor de kan betale billetterne og bestille
          drikkevarer. Betaler de på faktura, markerer du bookingen betalt under &quot;Slå en
          booking op&quot;. Tre dage før fristen får kunden en påmindelse.
        </p>

        <label style={label} htmlFor="sel-show">Forestilling</label>
        <select
          id="sel-show"
          style={input}
          value={showId}
          onChange={(e) => {
            setShowId(e.target.value);
            setQty({});
            setResultat(null);
          }}
        >
          <option value="">Vælg forestilling…</option>
          {shows.map((s) => (
            <option key={s.id} value={s.id}>
              {dato(s.date)} kl. {s.time} – {s.title}
            </option>
          ))}
        </select>

        {show && (
          <>
            <label style={label}>Billetter</label>
            {synlige.map((t) => {
              const ledige =
                tilbage && t.kapacitetskategori ? tilbage[t.kapacitetskategori] : undefined;
              const over = ledige !== undefined && antal(t.id) > ledige;
              return (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "8px 0",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <span>
                    {t.category} <span style={{ color: "#777", fontSize: 13 }}>({t.prisKr} kr.)</span>
                    <br />
                    <span style={{ fontSize: 13, color: over ? "#8a1f2b" : "#555", fontWeight: over ? 700 : 400 }}>
                      {ledige === undefined
                        ? "Henter ledige pladser…"
                        : `${ledige} ledige i det almindelige system${over ? " – du reserverer flere" : ""}`}
                    </span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`Antal ${t.category}`}
                    value={qty[t.id] ?? ""}
                    onChange={(e) => setQty((p) => ({ ...p, [t.id]: e.target.value }))}
                    style={{ ...input, width: 80, textAlign: "right" }}
                  />
                </div>
              );
            })}
            {iAlt > 0 && (
              <p style={{ marginTop: 10, fontWeight: 600 }}>
                {iAlt} billetter, {kr.toLocaleString("da-DK")} kr. (drikkevarer kommer oveni, hvis kunden vælger dem)
              </p>
            )}

            <label style={label} htmlFor="sel-frist">Sidste betalingsfrist *</label>
            <input
              id="sel-frist"
              type="date"
              style={input}
              min={idag}
              max={show.date}
              value={frist}
              onChange={(e) => setFrist(e.target.value)}
            />
          </>
        )}

        <label style={label} htmlFor="sel-navn">Kontaktperson *</label>
        <input id="sel-navn" style={input} value={navn} onChange={(e) => setNavn(e.target.value)} />
        <label style={label} htmlFor="sel-firma">Firma eller forening</label>
        <input id="sel-firma" style={input} value={firma} onChange={(e) => setFirma(e.target.value)} />
        <label style={label} htmlFor="sel-email">E-mail * (linket til betaling sendes hertil)</label>
        <input id="sel-email" style={input} value={email} onChange={(e) => setEmail(e.target.value)} />
        <label style={label} htmlFor="sel-tlf">Telefon</label>
        <input id="sel-tlf" style={input} value={telefon} onChange={(e) => setTelefon(e.target.value)} />
        <label style={label} htmlFor="sel-note">Bemærkning (vises i bordplanen)</label>
        <input id="sel-note" style={input} value={note} onChange={(e) => setNote(e.target.value)} />

        {fejl && <p style={{ color: "#a00", marginTop: 16 }} role="alert">{fejl}</p>}
        {oversalg && (
          <div
            role="alert"
            style={{
              marginTop: 16,
              padding: 14,
              border: "2px solid #8a1f2b",
              borderRadius: 6,
              background: "#fdf3f4",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <strong>Advarsel: ikke plads nok.</strong>
            <p style={{ margin: "6px 0" }}>{oversalg.advarsel}</p>
            <ul style={{ margin: "6px 0 10px 18px", padding: 0 }}>
              {oversalg.detaljer.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <button type="button" onClick={() => opret(true)} disabled={arbejder} style={{ ...knap, background: "#8a1f2b" }}>
              Reservér alligevel
            </button>
          </div>
        )}
        {resultat && (
          <div
            role="status"
            style={{ marginTop: 16, padding: 14, border: "1px solid #0d3b2e", borderRadius: 6, background: "#f2f8f4" }}
          >
            <strong>Reserveret:</strong> {resultat.bookingNo} ({resultat.ticketBreakdown}),{" "}
            {resultat.billetterKr.toLocaleString("da-DK")} kr.
            <br />
            {resultat.emailed
              ? "Kunden har fået en mail med linket til betaling."
              : "Mailen kunne ikke sendes. Send linket herunder til kunden."}
            <div style={{ marginTop: 10, fontSize: 13, wordBreak: "break-all" }}>
              Link til betaling: <a href={resultat.betalingsside}>{resultat.betalingsside}</a>
            </div>
          </div>
        )}

        <button type="button" onClick={() => opret()} disabled={arbejder} style={{ ...knap, marginTop: 20 }}>
          {arbejder ? "Reserverer…" : "Reservér og send link til kunden"}
        </button>

        <h2 style={{ fontSize: 20, marginTop: 40 }}>Reservationer</h2>
        {liste === null ? (
          <p style={{ color: "#777" }}>Henter…</p>
        ) : liste.length === 0 ? (
          <p style={{ color: "#777" }}>Ingen reservationer endnu.</p>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
                <th style={{ padding: 6 }}>Booking</th>
                <th style={{ padding: 6 }}>Kunde</th>
                <th style={{ padding: 6 }}>Pers.</th>
                <th style={{ padding: 6 }}>Frist</th>
                <th style={{ padding: 6 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((s) => (
                <tr key={s.bookingId} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 6 }}>
                    <a href={`/admin/opslag?nr=${encodeURIComponent(s.bookingNo)}`} style={{ color: "#0d3b2e" }}>
                      {s.bookingNo}
                    </a>
                  </td>
                  <td style={{ padding: 6 }}>{s.kunde}</td>
                  <td style={{ padding: 6 }}>{s.antal}</td>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>{dato(s.frist)}</td>
                  <td
                    style={{
                      padding: 6,
                      color: s.tilstand === "frist overskredet" ? "#8a1f2b" : undefined,
                      fontWeight: s.tilstand === "frist overskredet" ? 700 : 400,
                    }}
                  >
                    {s.tilstand}
                    {s.tilstand === "afventer betaling" && s.paamindelseSendt ? " (påmindet)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
