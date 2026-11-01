"use client";

// Slå en booking op på bookingnummeret og se alt om bookingen og kunden.
// Kun visning; intet ændres herfra.

import { useCallback, useEffect, useState } from "react";
import type { Opslag } from "@/lib/bookingopslag";

type Anden = { bookingNo: string; antal: number; status: string; dato: string; tid: string };

const DATO_TID = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const DATO = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const KR = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" });

function visDatoTid(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DATO_TID.format(d);
}
function visDato(dato: string): string {
  const d = new Date(`${dato}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? dato : DATO.format(d);
}

const side: React.CSSProperties = {
  background: "#fff",
  color: "#1a1a16",
  minHeight: "100vh",
  padding: "32px 24px",
  fontFamily: "sans-serif",
};
const boks: React.CSSProperties = {
  border: "1px solid #e5e0d0",
  borderRadius: 4,
  padding: 16,
  marginBottom: 16,
};
const etiket: React.CSSProperties = { color: "#777", padding: "4px 12px 4px 0", verticalAlign: "top", whiteSpace: "nowrap" };
const vaerdi: React.CSSProperties = { padding: "4px 0", verticalAlign: "top", whiteSpace: "pre-line" };

function Linje({ navn, children }: { navn: string; children: React.ReactNode }) {
  if (children === "" || children === null || children === undefined) return null;
  return (
    <tr>
      <td style={etiket}>{navn}</td>
      <td style={vaerdi}>{children}</td>
    </tr>
  );
}

export default function OpslagClient({ startNr }: { startNr: string }) {
  const [nr, setNr] = useState(startNr);
  const [henter, setHenter] = useState(false);
  const [fejl, setFejl] = useState("");
  const [opslag, setOpslag] = useState<Opslag | null>(null);
  const [andre, setAndre] = useState<Anden[]>([]);

  const slaaOp = useCallback(async (vaerdi: string) => {
    if (!vaerdi.trim()) return;
    setHenter(true);
    setFejl("");
    setOpslag(null);
    setAndre([]);
    try {
      const res = await fetch(`/api/admin/bookingopslag?nr=${encodeURIComponent(vaerdi.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setFejl(data.error || "Opslaget mislykkedes.");
        return;
      }
      setOpslag(data.opslag);
      setAndre(data.andre || []);
    } catch {
      setFejl("Opslaget mislykkedes. Prøv igen om lidt.");
    } finally {
      setHenter(false);
    }
  }, []);

  useEffect(() => {
    if (startNr) slaaOp(startNr);
  }, [startNr, slaaOp]);

  const o = opslag;
  return (
    <div style={side}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 16 }}>
          <a href="/funktioner" style={{ color: "#0d3b2e", fontWeight: 600 }}>← Funktioner</a>
          <a href="/admin" style={{ color: "#0d3b2e", fontWeight: 600 }}>Bordplan</a>
        </div>
        <h1 style={{ marginBottom: 4 }}>Slå en booking op</h1>
        <p style={{ color: "#666", marginTop: 0 }}>
          Skriv bookingnummeret, fx BH-K7M2Q9XR eller BH260717268 for en overført booking.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            slaaOp(nr);
          }}
          style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}
        >
          <input
            value={nr}
            onChange={(e) => setNr(e.target.value)}
            placeholder="Bookingnummer"
            autoFocus
            style={{ padding: 8, fontSize: 16, flex: "1 1 220px" }}
          />
          <button
            type="submit"
            disabled={henter}
            style={{
              padding: "8px 18px",
              background: "#0d3b2e",
              color: "#fff",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              fontSize: 15,
            }}
          >
            {henter ? "Henter…" : "Slå op"}
          </button>
        </form>

        {fejl && <p style={{ color: "#8a1f2b" }}>{fejl}</p>}

        {o && (
          <>
            <div style={boks}>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>
                {o.bookingNo}
                {o.gaestenummer !== null && (
                  <span style={{ color: "#777", fontWeight: 400 }}> · gæst nr. {o.gaestenummer}</span>
                )}
              </h2>
              <table style={{ borderCollapse: "collapse", fontSize: 15 }}>
                <tbody>
                  <Linje navn="Status">{o.status}</Linje>
                  <Linje navn="Forestilling">
                    {o.forestilling ? `${visDato(o.forestilling.date)} kl. ${o.forestilling.time}` : ""}
                  </Linje>
                  <Linje navn="Bestilt">{visDatoTid(o.bestilt)}</Linje>
                  <Linje navn="Billetter">
                    {o.billetter.map((b) => `${b.antal} × ${b.kategori}`).join("\n")}
                  </Linje>
                  <Linje navn="Bord">{o.bord}</Linje>
                  <Linje navn="Drikkevarer">{o.tilvalg.split(",").map((t) => t.trim()).filter(Boolean).join("\n")}</Linje>
                  <Linje navn="Onlinerabat">{o.onlinerabat ? KR.format(o.onlinerabat) : ""}</Linje>
                  <Linje navn="Betalt i alt">{o.betaltIAlt !== null ? KR.format(o.betaltIAlt) : ""}</Linje>
                  <Linje navn="Bemærkning">{o.bemaerkning}</Linje>
                  <Linje navn="Særlige ønsker (alt)">
                    {o.saerligeOenskerRaa !== o.bemaerkning ? o.saerligeOenskerRaa : ""}
                  </Linje>
                  <Linje navn="Påmindelse sendt">{o.varselSendt ? "Ja" : ""}</Linje>
                </tbody>
              </table>
            </div>

            <div style={boks}>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>Kunde</h2>
              <table style={{ borderCollapse: "collapse", fontSize: 15 }}>
                <tbody>
                  <Linje navn="Navn">{o.kunde.navn}</Linje>
                  <Linje navn="Firma">{o.kunde.firma}</Linje>
                  <Linje navn="Adresse">
                    {[o.kunde.adresse, [o.kunde.postnr, o.kunde.by].filter(Boolean).join(" ")]
                      .filter(Boolean)
                      .join("\n")}
                  </Linje>
                  <Linje navn="Telefon">
                    {o.kunde.telefon ? <a href={`tel:${o.kunde.telefon}`}>{o.kunde.telefon}</a> : ""}
                  </Linje>
                  <Linje navn="Mail">
                    {o.kunde.email ? <a href={`mailto:${o.kunde.email}`}>{o.kunde.email}</a> : ""}
                  </Linje>
                </tbody>
              </table>
            </div>

            {o.match.vilMatches && (
              <div style={boks}>
                <h2 style={{ marginTop: 0, fontSize: 18 }}>Svar til bordplaceringen</h2>
                <table style={{ borderCollapse: "collapse", fontSize: 15 }}>
                  <tbody>
                    <Linje navn="Alder">{o.match.alder}</Linje>
                    <Linje navn="Fra">{o.match.fra}</Linje>
                    <Linje navn="Drikker helst">{o.match.drik}</Linje>
                    <Linje navn="Interesser">{o.match.interesser}</Linje>
                    <Linje navn="Andet">{o.match.note}</Linje>
                  </tbody>
                </table>
              </div>
            )}

            {andre.length > 0 && (
              <div style={boks}>
                <h2 style={{ marginTop: 0, fontSize: 18 }}>Kundens andre bookinger</h2>
                <table style={{ borderCollapse: "collapse", fontSize: 15, width: "100%" }}>
                  <tbody>
                    {andre.map((a) => (
                      <tr key={a.bookingNo} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "6px 8px 6px 0" }}>
                          <a href={`/admin/opslag?nr=${encodeURIComponent(a.bookingNo)}`}>{a.bookingNo}</a>
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {a.dato ? `${visDato(a.dato)} kl. ${a.tid}` : ""}
                        </td>
                        <td style={{ padding: "6px 8px" }}>{a.antal} pers.</td>
                        <td style={{ padding: "6px 0", color: "#777" }}>{a.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
