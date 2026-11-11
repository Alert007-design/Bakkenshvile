"use client";

// Slå en booking op på bookingnummeret og se alt om bookingen og kunden.
// Herfra kan man også skrive en note, rette kundens email, tilføje billetter,
// flytte en betalt booking til en anden dato og annullere den.

import { useCallback, useEffect, useState } from "react";
import type { Opslag } from "@/lib/bookingopslag";
import { SELSKAB_STATUS } from "@/lib/selskab-konstanter";

// Samme loft som på serveren (lib/booking-note.ts). Gentaget her, så
// browseren ikke henter Airtable-koden med.
const NOTE_MAKS = 300;

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

export default function OpslagClient({ startNr, csrf }: { startNr: string; csrf: string }) {
  const [nr, setNr] = useState(startNr);
  const [henter, setHenter] = useState(false);
  const [fejl, setFejl] = useState("");
  const [opslag, setOpslag] = useState<Opslag | null>(null);
  const [andre, setAndre] = useState<Anden[]>([]);
  const [fakturaBesked, setFakturaBesked] = useState("");
  const [fakturaArbejder, setFakturaArbejder] = useState(false);
  const [visAnnuller, setVisAnnuller] = useState(false);
  const [harForstaaet, setHarForstaaet] = useState(false);
  const [annullerArbejder, setAnnullerArbejder] = useState(false);
  const [annullerFejl, setAnnullerFejl] = useState("");
  const [annullerResultat, setAnnullerResultat] = useState<{
    bookingNo: string;
    beloebKr: number;
    beloebKilde: "viva" | "airtable" | "ingen";
    pladserFrigivet: boolean;
  } | null>(null);

  const [note, setNote] = useState("");
  const [noteArbejder, setNoteArbejder] = useState(false);
  const [noteBesked, setNoteBesked] = useState("");
  const [noteFejl, setNoteFejl] = useState(false);

  async function gemNote(o: Opslag) {
    setNoteArbejder(true);
    setNoteBesked("");
    setNoteFejl(false);
    try {
      const res = await fetch("/api/admin/note", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ bookingId: o.id, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Noten blev ikke gemt.");
      setNote("");
      await slaaOp(o.bookingNo);
      setNoteBesked("Noten er gemt.");
    } catch (e) {
      setNoteFejl(true);
      setNoteBesked(e instanceof Error ? e.message : "Noten blev ikke gemt.");
    } finally {
      setNoteArbejder(false);
    }
  }

  const [visRetEmail, setVisRetEmail] = useState(false);
  const [nyEmail, setNyEmail] = useState("");
  const [emailArbejder, setEmailArbejder] = useState(false);
  const [emailBesked, setEmailBesked] = useState("");
  const [emailForslag, setEmailForslag] = useState("");
  const [emailRettet, setEmailRettet] = useState<{
    bookingNo: string;
    email: string;
    antalBookinger: number;
  } | null>(null);
  const [billetSendes, setBilletSendes] = useState(false);
  const [billetSendt, setBilletSendt] = useState(false);

  async function retEmail(o: Opslag, email: string, bekraeftet: boolean) {
    setEmailArbejder(true);
    setEmailBesked("");
    setEmailForslag("");
    try {
      const res = await fetch("/api/admin/kunde-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ bookingId: o.id, email, bekraeftet }),
      });
      const data = await res.json();
      if (res.status === 409 && data.forslag) {
        setEmailForslag(data.forslag);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Emailen blev ikke rettet.");
      setVisRetEmail(false);
      setBilletSendt(false);
      await slaaOp(o.bookingNo);
      setEmailRettet({ bookingNo: o.bookingNo, email: data.email, antalBookinger: data.antalBookinger });
    } catch (e) {
      setEmailBesked(e instanceof Error ? e.message : "Emailen blev ikke rettet.");
    } finally {
      setEmailArbejder(false);
    }
  }

  async function sendBilletIgen(o: Opslag) {
    setBilletSendes(true);
    try {
      const res = await fetch("/api/admin/resend-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ bookingId: o.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Billetten blev ikke sendt.");
      setBilletSendt(true);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Billetten blev ikke sendt.");
    } finally {
      setBilletSendes(false);
    }
  }

  type Mulighed = {
    id: string;
    title: string;
    date: string;
    time: string;
    ledige: Record<string, number>;
    plads: boolean;
    prisforskelKr: number | null;
    grund: string;
  };
  const [visFlyt, setVisFlyt] = useState(false);
  const [flytHenter, setFlytHenter] = useState(false);
  const [flytMuligheder, setFlytMuligheder] = useState<Mulighed[]>([]);
  const [flytOensket, setFlytOensket] = useState<Record<string, number>>({});
  const [flytValgt, setFlytValgt] = useState("");
  const [flytFejl, setFlytFejl] = useState("");
  const [flytArbejder, setFlytArbejder] = useState(false);
  const [flytResultat, setFlytResultat] = useState<{
    bookingNo: string;
    fra: string;
    til: string;
    prisforskelKr: number;
    betalingslink?: string;
    tilgodeseddel?: { kode: string; kr: number };
    emailed: boolean;
    advarsler: string[];
  } | null>(null);

  function prisforskelTekst(kr: number | null): string {
    if (kr === null) return "";
    if (kr > 0) return `${KR.format(kr)} mere`;
    if (kr < 0) return `${KR.format(-kr)} billigere`;
    return "Samme pris";
  }

  const KATEGORI: Record<string, string> = {
    aplusForrest: "A+ forrest",
    aplusBagerst: "A+ bagerst",
    a: "A",
    b: "B",
  };
  function ledigeTekst(ledige: Record<string, number>): string {
    return Object.keys(flytOensket)
      .map((k) => `${KATEGORI[k] ?? k}: ${ledige[k] ?? 0} ledige`)
      .join(", ");
  }

  async function aabnFlyt(o: Opslag) {
    setVisFlyt(true);
    setFlytHenter(true);
    setFlytFejl("");
    setFlytValgt("");
    setFlytMuligheder([]);
    try {
      const res = await fetch(`/api/admin/flyt?bookingId=${encodeURIComponent(o.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Datoerne kunne ikke hentes.");
      setFlytMuligheder(data.muligheder || []);
      setFlytOensket(data.oensket || {});
    } catch (e) {
      setFlytFejl(e instanceof Error ? e.message : "Datoerne kunne ikke hentes.");
    } finally {
      setFlytHenter(false);
    }
  }

  async function flyt(o: Opslag) {
    const m = flytMuligheder.find((x) => x.id === flytValgt);
    if (!m) return;
    const ekstra =
      m.prisforskelKr && m.prisforskelKr > 0
        ? ` Kunden får et link til at betale ${KR.format(m.prisforskelKr)} med kort.`
        : m.prisforskelKr && m.prisforskelKr < 0
          ? ` Kunden får en tilgodeseddel på ${KR.format(-m.prisforskelKr)} til baren.`
          : "";
    if (
      !window.confirm(
        `Flyt ${o.bookingNo} til ${visDato(m.date)} kl. ${m.time}? Kunden får straks en ny billet på mail.${ekstra}`
      )
    ) {
      return;
    }
    setFlytArbejder(true);
    setFlytFejl("");
    try {
      const res = await fetch("/api/admin/flyt", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ bookingId: o.id, showId: m.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bookingen blev ikke flyttet.");
      setVisFlyt(false);
      await slaaOp(o.bookingNo);
      setFlytResultat(data);
    } catch (e) {
      setFlytFejl(e instanceof Error ? e.message : "Bookingen blev ikke flyttet.");
    } finally {
      setFlytArbejder(false);
    }
  }

  async function annuller(o: Opslag) {
    setAnnullerArbejder(true);
    setAnnullerFejl("");
    try {
      const res = await fetch("/api/admin/annuller", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ bookingId: o.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Det lykkedes ikke.");
      setAnnullerResultat({
        bookingNo: data.bookingNo,
        beloebKr: data.beloebKr,
        beloebKilde: data.beloebKilde,
        pladserFrigivet: data.pladserFrigivet,
      });
      setVisAnnuller(false);
      setHarForstaaet(false);
      await slaaOp(o.bookingNo);
    } catch (e) {
      setAnnullerFejl(e instanceof Error ? e.message : "Det lykkedes ikke.");
    } finally {
      setAnnullerArbejder(false);
    }
  }

  // Prøver at frigive pladser, der blev hængende efter en annullering. Serveren
  // afviser selve annulleringen (den er allerede sket), men prøver frigivelsen.
  async function proevPladserIgen(o: Opslag) {
    setAnnullerArbejder(true);
    try {
      const res = await fetch("/api/admin/annuller", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ bookingId: o.id }),
      });
      const data = await res.json();
      if (data?.pladserFrigivet === true) {
        setAnnullerResultat((r) => (r ? { ...r, pladserFrigivet: true } : r));
      }
    } catch {
      // Beskeden om manglende frigivelse står stadig, så man kan prøve igen.
    } finally {
      setAnnullerArbejder(false);
    }
  }

  async function markerFaktura(bookingId: string, bookingNo: string) {
    if (
      !window.confirm(
        `Markér ${bookingNo} som betalt på faktura? Kunden får sin billet på mail, og pladserne tælles som solgt.`
      )
    ) {
      return;
    }
    setFakturaArbejder(true);
    setFakturaBesked("");
    try {
      const res = await fetch("/api/admin/selskab", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ handling: "faktura", bookingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Det lykkedes ikke.");
      setFakturaBesked("Markeret som betalt. Kunden har fået sin billet, og Dot har fået besked.");
      await slaaOp(bookingNo);
    } catch (e) {
      setFakturaBesked(e instanceof Error ? e.message : "Det lykkedes ikke.");
    } finally {
      setFakturaArbejder(false);
    }
  }

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
            {annullerResultat && annullerResultat.bookingNo === o.bookingNo && (
              <div
                style={{
                  background: "#fff4d6",
                  border: "2px solid #b8860b",
                  borderRadius: 4,
                  padding: "12px 16px",
                  marginBottom: 16,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 17 }}>
                  Bookingen er annulleret.
                </div>
                {annullerResultat.beloebKilde === "ingen" ? (
                  <p style={{ margin: "8px 0 0" }}>
                    Der er ikke betalt noget for {annullerResultat.bookingNo} (fribillet eller ingen betaling), så der
                    er ikke noget at refundere.
                  </p>
                ) : (
                  <>
                    <p style={{ margin: "8px 0 0", fontWeight: 700 }}>
                      Husk at refundere betalingen manuelt i Viva: {KR.format(annullerResultat.beloebKr)}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 14 }}>
                      Søg efter bookingnummer {annullerResultat.bookingNo} i Viva.
                      {annullerResultat.beloebKilde === "airtable"
                        ? " Beløbet er læst fra feltet \"Betalt i alt\" i Airtable, så tjek det mod betalingen i Viva."
                        : ""}
                    </p>
                  </>
                )}
                <p style={{ margin: "4px 0 0", fontSize: 14 }}>Kunden har ikke fået nogen besked fra systemet.</p>
                {!annullerResultat.pladserFrigivet && (
                  <div style={{ marginTop: 10, color: "#8a1f2b", fontWeight: 700 }}>
                    Pladserne blev ikke frigivet, så de kan endnu ikke sælges igen.
                    <div>
                      <button
                        type="button"
                        disabled={annullerArbejder}
                        onClick={() => proevPladserIgen(o)}
                        style={{ marginTop: 6, padding: "6px 12px", cursor: "pointer" }}
                      >
                        {annullerArbejder ? "Prøver…" : "Prøv at frigive pladserne igen"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {o.status === "Annulleret" && (
              <div
                style={{
                  background: "#fbe9e7",
                  border: "2px solid #b3261e",
                  color: "#b3261e",
                  borderRadius: 4,
                  padding: "10px 14px",
                  marginBottom: 16,
                  fontWeight: 700,
                }}
              >
                Denne booking er annulleret.
              </div>
            )}
            <div style={boks}>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>
                {o.bookingNo}
                {o.gaestenummer !== null && (
                  <span style={{ color: "#777", fontWeight: 400 }}> · gæst nr. {o.gaestenummer}</span>
                )}
              </h2>
              {o.manglerBetaling !== null && (
                <div
                  style={{
                    background: "#fbe9e7",
                    border: "2px solid #b3261e",
                    color: "#b3261e",
                    borderRadius: 4,
                    padding: "10px 14px",
                    marginBottom: 14,
                    fontWeight: 700,
                  }}
                >
                  Mangler betaling: {KR.format(o.manglerBetaling)}
                  <div style={{ fontWeight: 400, fontSize: 13, color: "#5a1a14", marginTop: 4 }}>
                    Bestillingen er ikke betalt i det gamle system. Pladserne er holdt. Mærket forsvinder, når det fulde
                    beløb står i feltet &quot;Betalt i alt&quot; i Airtable.
                  </div>
                </div>
              )}
              <table style={{ borderCollapse: "collapse", fontSize: 15 }}>
                <tbody>
                  <Linje navn="Status">{o.status}</Linje>
                  <Linje navn="Betalingsfrist">{o.betalingsfrist ? visDato(o.betalingsfrist) : ""}</Linje>
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  gemNote(o);
                }}
                style={{ marginTop: 14 }}
              >
                <label htmlFor="ny-note" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                  Tilføj note
                </label>
                <textarea
                  id="ny-note"
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setNoteBesked("");
                  }}
                  maxLength={NOTE_MAKS}
                  rows={2}
                  placeholder="Fx: Kommer i kørestol, sæt dem tæt ved udgangen"
                  style={{ width: "100%", padding: 8, fontSize: 15, boxSizing: "border-box", fontFamily: "inherit" }}
                />
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                  <button
                    type="submit"
                    disabled={noteArbejder || !note.trim()}
                    style={{
                      padding: "6px 14px",
                      background: "#0d3b2e",
                      color: "#fff",
                      border: "none",
                      borderRadius: 3,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    {noteArbejder ? "Gemmer…" : "Gem note"}
                  </button>
                  <span style={{ fontSize: 13, color: "#777" }}>
                    Noten kommer med på gæstelisten. Kunden kan ikke se den.
                  </span>
                </div>
                {noteBesked && (
                  <p style={{ margin: "6px 0 0", fontSize: 14, color: noteFejl ? "#8a1f2b" : "#0d3b2e" }}>
                    {noteBesked}
                  </p>
                )}
              </form>
              {o.status !== "Annulleret" && o.showId && (
                <div style={{ marginTop: 14 }}>
                  <a
                    href={`/admin/ekstrabillet?${new URLSearchParams({
                      show: o.showId,
                      navn: o.kunde.navn,
                      email: o.kunde.email,
                      tlf: o.kunde.telefon,
                      tilhoerer: o.bookingNo,
                    }).toString()}`}
                    style={{
                      display: "inline-block",
                      padding: "6px 14px",
                      border: "1px solid #0d3b2e",
                      color: "#0d3b2e",
                      borderRadius: 3,
                      fontSize: 14,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Tilføj billetter
                  </a>
                  <span style={{ marginLeft: 10, fontSize: 13, color: "#777" }}>
                    Gæsten får et link til at betale de ekstra billetter med kort.
                  </span>
                </div>
              )}
              {o.status === SELSKAB_STATUS && (
                <div style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    disabled={fakturaArbejder}
                    onClick={() => markerFaktura(o.id, o.bookingNo)}
                    style={{
                      padding: "8px 16px",
                      background: "#0d3b2e",
                      color: "#fff",
                      border: "none",
                      borderRadius: 3,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    {fakturaArbejder ? "Gemmer…" : "Markér som betalt (faktura)"}
                  </button>
                </div>
              )}
              {fakturaBesked && <p style={{ marginBottom: 0 }}>{fakturaBesked}</p>}
              {flytResultat && flytResultat.bookingNo === o.bookingNo && (
                <div
                  style={{
                    marginTop: 14,
                    background: "#eef6f1",
                    border: "2px solid #0d3b2e",
                    borderRadius: 4,
                    padding: "10px 14px",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    Bookingen er flyttet fra {flytResultat.fra} til {flytResultat.til}.
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 14 }}>
                    {flytResultat.emailed
                      ? "Kunden har fået en ny billet på mail."
                      : "Kunden har ikke fået en ny billet på mail."}
                    {" "}Bordnummer og gæstenummer er nulstillet.
                  </p>
                  {flytResultat.prisforskelKr > 0 && flytResultat.betalingslink && (
                    <p style={{ margin: "6px 0 0", fontSize: 14 }}>
                      Kunden skal betale {KR.format(flytResultat.prisforskelKr)} i prisforskel. Linket er sendt med
                      billetten og gælder i 24 timer:{" "}
                      <a href={flytResultat.betalingslink} style={{ wordBreak: "break-all" }}>
                        {flytResultat.betalingslink}
                      </a>
                    </p>
                  )}
                  {flytResultat.tilgodeseddel && (
                    <p style={{ margin: "6px 0 0", fontSize: 14 }}>
                      Kunden har fået en tilgodeseddel på {KR.format(flytResultat.tilgodeseddel.kr)} til baren på
                      dagen. Kode: <strong>{flytResultat.tilgodeseddel.kode}</strong> (findes under Gavekort).
                    </p>
                  )}
                  {flytResultat.advarsler.map((a) => (
                    <p key={a} style={{ margin: "6px 0 0", fontSize: 14, color: "#8a1f2b", fontWeight: 700 }}>
                      {a}
                    </p>
                  ))}
                </div>
              )}
              {o.status === "Betalt" && !visFlyt && (
                <div style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => aabnFlyt(o)}
                    style={{
                      padding: "8px 16px",
                      background: "#fff",
                      color: "#0d3b2e",
                      border: "2px solid #0d3b2e",
                      borderRadius: 3,
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    Flyt til anden dato
                  </button>
                </div>
              )}
              {visFlyt && (
                <div style={{ marginTop: 14, borderTop: "1px solid #e5e0d0", paddingTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Flyt til anden dato</div>
                  {flytHenter && <p style={{ margin: 0 }}>Henter datoer…</p>}
                  {!flytHenter && flytMuligheder.length === 0 && !flytFejl && (
                    <p style={{ margin: 0 }}>Der er ingen andre kommende forestillinger.</p>
                  )}
                  {flytMuligheder.length > 0 && (
                    <table style={{ borderCollapse: "collapse", fontSize: 14, width: "100%" }}>
                      <tbody>
                        {flytMuligheder.map((m) => {
                          const kan = m.plads && !m.grund && m.prisforskelKr !== null;
                          return (
                            <tr key={m.id} style={{ borderBottom: "1px solid #eee", color: kan ? "#1a1a16" : "#999" }}>
                              <td style={{ padding: "6px 8px 6px 0" }}>
                                <input
                                  type="radio"
                                  name="flyt-til"
                                  id={`flyt-${m.id}`}
                                  disabled={!kan}
                                  checked={flytValgt === m.id}
                                  onChange={() => setFlytValgt(m.id)}
                                />
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <label htmlFor={`flyt-${m.id}`}>
                                  {visDato(m.date)} kl. {m.time}
                                </label>
                              </td>
                              <td style={{ padding: "6px 8px" }}>{prisforskelTekst(m.prisforskelKr)}</td>
                              <td style={{ padding: "6px 0", fontSize: 13 }}>{m.grund || ledigeTekst(m.ledige)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {flytFejl && <p style={{ color: "#8a1f2b", fontWeight: 700, margin: "8px 0 0" }}>{flytFejl}</p>}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={!flytValgt || flytArbejder}
                      onClick={() => flyt(o)}
                      style={{
                        padding: "6px 14px",
                        background: "#0d3b2e",
                        color: "#fff",
                        border: "none",
                        borderRadius: 3,
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      {flytArbejder ? "Flytter…" : "Flyt bookingen"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisFlyt(false)}
                      style={{ padding: "6px 12px", cursor: "pointer", fontSize: 14 }}
                    >
                      Fortryd
                    </button>
                  </div>
                  <p style={{ fontSize: 13, color: "#777", margin: "8px 0 0" }}>
                    Kunden får straks en ny billet på mail. Er den nye dato dyrere, kommer der et link til at betale
                    forskellen med kort. Er den billigere, får kunden en tilgodeseddel til baren på dagen.
                  </p>
                </div>
              )}
              {o.status === "Betalt" && (
                <div style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setAnnullerFejl("");
                      setHarForstaaet(false);
                      setVisAnnuller(true);
                    }}
                    style={{
                      padding: "8px 16px",
                      background: "#fff",
                      color: "#b3261e",
                      border: "2px solid #b3261e",
                      borderRadius: 3,
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    Annullér booking
                  </button>
                </div>
              )}
              {o.status !== "Betalt" && o.status !== "Annulleret" && (
                <p style={{ color: "#777", fontSize: 13, marginBottom: 0 }}>
                  Kun betalte bookinger kan annulleres her.
                </p>
              )}
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
              {!visRetEmail && (
                <button
                  type="button"
                  onClick={() => {
                    setNyEmail(o.kunde.email);
                    setEmailBesked("");
                    setEmailForslag("");
                    setEmailRettet(null);
                    setVisRetEmail(true);
                  }}
                  style={{ marginTop: 10, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}
                >
                  Ret email
                </button>
              )}
              {visRetEmail && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    retEmail(o, nyEmail, false);
                  }}
                  style={{ marginTop: 12 }}
                >
                  <label htmlFor="ny-email" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                    Ny email
                  </label>
                  <input
                    id="ny-email"
                    type="email"
                    value={nyEmail}
                    onChange={(e) => {
                      setNyEmail(e.target.value);
                      setEmailBesked("");
                      setEmailForslag("");
                    }}
                    autoComplete="off"
                    style={{ padding: 8, fontSize: 15, width: "100%", maxWidth: 360, boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button
                      type="submit"
                      disabled={emailArbejder || !nyEmail.trim()}
                      style={{
                        padding: "6px 14px",
                        background: "#0d3b2e",
                        color: "#fff",
                        border: "none",
                        borderRadius: 3,
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      {emailArbejder ? "Gemmer…" : "Gem email"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisRetEmail(false)}
                      style={{ padding: "6px 12px", cursor: "pointer", fontSize: 14 }}
                    >
                      Fortryd
                    </button>
                  </div>
                  {emailForslag && (
                    <div style={{ marginTop: 10, background: "#fff4d6", border: "1px solid #b8860b", padding: "8px 12px", borderRadius: 4 }}>
                      <div style={{ fontWeight: 700 }}>Mente du {emailForslag}?</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          disabled={emailArbejder}
                          onClick={() => {
                            setNyEmail(emailForslag);
                            retEmail(o, emailForslag, false);
                          }}
                          style={{ padding: "5px 12px", cursor: "pointer", fontSize: 14 }}
                        >
                          Ja, brug {emailForslag}
                        </button>
                        <button
                          type="button"
                          disabled={emailArbejder}
                          onClick={() => retEmail(o, nyEmail, true)}
                          style={{ padding: "5px 12px", cursor: "pointer", fontSize: 14 }}
                        >
                          Nej, gem som skrevet
                        </button>
                      </div>
                    </div>
                  )}
                  {emailBesked && <p style={{ margin: "8px 0 0", fontSize: 14, color: "#8a1f2b" }}>{emailBesked}</p>}
                </form>
              )}
              {emailRettet && emailRettet.bookingNo === o.bookingNo && (
                <div style={{ marginTop: 12, background: "#eef6f1", border: "1px solid #0d3b2e", padding: "10px 14px", borderRadius: 4 }}>
                  <div style={{ fontWeight: 700 }}>Emailen er rettet til {emailRettet.email}.</div>
                  {emailRettet.antalBookinger > 1 && (
                    <p style={{ margin: "4px 0 0", fontSize: 14 }}>
                      Kunden har {emailRettet.antalBookinger} bookinger, og rettelsen gælder dem alle.
                    </p>
                  )}
                  {o.status !== "Annulleret" && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        disabled={billetSendes || billetSendt}
                        onClick={() => sendBilletIgen(o)}
                        style={{ padding: "6px 12px", cursor: "pointer", fontSize: 14 }}
                      >
                        {billetSendt
                          ? "Billetten er sendt"
                          : billetSendes
                            ? "Sender…"
                            : "Send billetten til den nye adresse"}
                      </button>
                      {!billetSendt && (
                        <span style={{ marginLeft: 10, fontSize: 13, color: "#777" }}>
                          Der sendes ikke noget, før du trykker.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
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

            {visAnnuller && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Annullér booking"
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 16,
                  zIndex: 50,
                }}
              >
                <div style={{ background: "#fff", borderRadius: 6, padding: 24, maxWidth: 480, width: "100%" }}>
                  <h2 style={{ marginTop: 0, fontSize: 20 }}>Annullér denne booking?</h2>
                  <table style={{ borderCollapse: "collapse", fontSize: 15, marginBottom: 14 }}>
                    <tbody>
                      <Linje navn="Bookingnummer">{o.bookingNo}</Linje>
                      <Linje navn="Navn">{o.kunde.navn}</Linje>
                      <Linje navn="Forestilling">
                        {o.forestilling
                          ? `${o.forestilling.title}, ${visDato(o.forestilling.date)} kl. ${o.forestilling.time}`
                          : ""}
                      </Linje>
                      <Linje navn="Antal billetter">{String(o.antal)}</Linje>
                    </tbody>
                  </table>
                  <p style={{ fontSize: 14, marginTop: 0 }}>
                    Pladserne frigives og kan sælges igen. Bookingen gemmes som annulleret af hensyn til regnskabet. Der
                    refunderes ikke noget automatisk, og kunden får ingen besked.
                  </p>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, marginBottom: 14 }}>
                    <input
                      type="checkbox"
                      checked={harForstaaet}
                      onChange={(e) => setHarForstaaet(e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    <span>Jeg ved, at pladserne frigives, og at jeg selv skal refundere betalingen i Viva.</span>
                  </label>
                  {annullerFejl && <p style={{ color: "#8a1f2b" }}>{annullerFejl}</p>}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      disabled={annullerArbejder}
                      onClick={() => setVisAnnuller(false)}
                      style={{ padding: "8px 16px", cursor: "pointer" }}
                    >
                      Fortryd
                    </button>
                    <button
                      type="button"
                      disabled={!harForstaaet || annullerArbejder}
                      onClick={() => annuller(o)}
                      style={{
                        padding: "8px 16px",
                        background: harForstaaet ? "#b3261e" : "#ccc",
                        color: "#fff",
                        border: "none",
                        borderRadius: 3,
                        cursor: harForstaaet ? "pointer" : "not-allowed",
                        fontWeight: 600,
                      }}
                    >
                      {annullerArbejder ? "Annullerer…" : "Ja, annullér bookingen"}
                    </button>
                  </div>
                </div>
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
