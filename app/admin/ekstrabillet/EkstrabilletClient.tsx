"use client";

import { useMemo, useState } from "react";

type Show = {
  id: string;
  title: string;
  date: string;
  time: string;
  priceGroup: string;
  soldOut: boolean;
};

type TicketType = {
  id: string;
  category: string;
  priceGroup: string;
  /** Pris + gebyr i hele kroner. Kun til visning – serveren regner selv. */
  prisKr: number;
};

const WEEKDAYS = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MONTHS = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

function formatShowDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Admin-siderne vises oven på sitets mørke tema; en eksplicit hvid fuldside-
// baggrund gør den mørke tekst læsbar.
const pageWrap: React.CSSProperties = {
  background: "#fff",
  color: "#1a1a16",
  minHeight: "100vh",
};
const box: React.CSSProperties = {
  maxWidth: 620,
  margin: "0 auto",
  padding: 24,
  fontFamily: "sans-serif",
  color: "#1a1a16",
};
const label: React.CSSProperties = { display: "block", fontWeight: 600, margin: "16px 0 6px" };
const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 15,
  boxSizing: "border-box",
};

export default function EkstrabilletClient({
  shows,
  ticketTypes,
  csrf,
}: {
  shows: Show[];
  ticketTypes: TicketType[];
  csrf: string;
}) {
  const [showId, setShowId] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    {
      bookingNo: string;
      ticketBreakdown: string;
      emailed: boolean;
      betalingslink: string;
      totalKr: number;
    } | null
  >(null);
  const [kopieret, setKopieret] = useState(false);
  // Sat, når serveren har svaret, at der ikke er plads nok. Personalet skal se
  // advarslen og trykke igen, før billetterne oprettes alligevel.
  const [oversalg, setOversalg] = useState<
    { advarsel: string; detaljer: string[] } | null
  >(null);

  const selectedShow = shows.find((s) => s.id === showId) ?? null;

  // Kun billettyper i den valgte forestillings prisgruppe.
  const visibleTickets = useMemo(() => {
    if (!selectedShow) return [];
    return ticketTypes.filter((t) => t.priceGroup === selectedShow.priceGroup);
  }, [ticketTypes, selectedShow]);

  const totalTickets = Object.values(qty).reduce((a, b) => a + b, 0);
  const totalKr = visibleTickets.reduce((s, t) => s + (qty[t.id] || 0) * t.prisKr, 0);

  function setTicket(id: string, delta: number) {
    setQty((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) }));
  }

  function selectShow(id: string) {
    setShowId(id);
    setQty({}); // nulstil antal, så mængder fra en anden prisgruppe ikke følger med
    setError(null);
    setResult(null);
  }

  /**
   * Opretter ekstrabilletterne. Er der ikke plads nok i kategorien, svarer serveren
   * 409 med en advarsel i stedet for at oprette noget. Så vises advarslen, og
   * først når personalet trykker igen (bekraeft = true), gives billetten
   * alligevel — og forestillingen bliver oversolgt med vilje.
   */
  async function submit(bekraeft = false) {
    setError(null);
    setResult(null);
    if (!bekraeft) setOversalg(null);
    if (!selectedShow) return setError("Vælg en forestilling.");
    if (!name.trim()) return setError("Skriv gæstens navn.");
    if (!email.trim()) return setError("Skriv gæstens e-mail. Betalingslinket sendes dertil.");
    if (totalTickets === 0) return setError("Vælg mindst én billet.");

    const tickets = visibleTickets
      .filter((t) => qty[t.id])
      .map((t) => ({ ticketTypeId: t.id, quantity: qty[t.id] }));

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/ekstrabillet`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
          body: JSON.stringify({
            showId: selectedShow.id,
            tickets,
            customer: { name: name.trim(), email: email.trim(), phone: phone.trim() },
            note: note.trim() || undefined,
            bekraeftOversalg: bekraeft || undefined,
          }),
        }
      );
      const data = await res.json();
      if (res.status === 409 && data?.kraeverBekraeftelse) {
        setOversalg({
          advarsel: String(data.advarsel ?? ""),
          detaljer: Array.isArray(data.detaljer) ? data.detaljer.map(String) : [],
        });
        return;
      }
      if (!res.ok) throw new Error(data.error || "Noget gik galt");
      setResult(data);
      setKopieret(false);
      setOversalg(null);
      // Nulstil felterne til næste gæst, men behold den valgte forestilling.
      setQty({});
      setName("");
      setEmail("");
      setPhone("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={pageWrap}>
      <div style={box}>
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
      <h1 style={{ fontSize: 24 }}>Ekstra betalte billetter</h1>
      <p style={{ color: "#555", fontSize: 14 }}>
        Læg betalte billetter ind, også når forestillingen er udsolgt. Gæsten
        får et betalingslink på mail, som gælder i 24 timer. Prisen er den
        almindelige billetpris med gebyr og kan ikke ændres. Billetten sendes
        først, når gæsten har betalt. Betaler gæsten ikke, frigives pladserne.
      </p>

      <label style={label} htmlFor="eks-show">Forestilling</label>
      <select
        id="eks-show"
        style={input}
        value={showId}
        onChange={(e) => selectShow(e.target.value)}
      >
        <option value="">Vælg forestilling…</option>
        {shows.map((s) => (
          <option key={s.id} value={s.id}>
            {formatShowDate(s.date)} kl. {s.time} — {s.title}
            {s.soldOut ? " (udsolgt)" : ""}
          </option>
        ))}
      </select>

      {selectedShow && (
        <>
          <label style={label}>Billetter ({selectedShow.priceGroup})</label>
          {visibleTickets.length === 0 ? (
            <p style={{ color: "#a00", fontSize: 14 }}>
              Ingen billettyper i denne prisgruppe.
            </p>
          ) : (
            visibleTickets.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                <span>
                  {t.category}{" "}
                  <span style={{ color: "#777", fontSize: 13 }}>({t.prisKr} kr.)</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setTicket(t.id, -1)}
                    disabled={!qty[t.id]}
                    aria-label={`Fjern ${t.category}`}
                  >
                    −
                  </button>
                  <span style={{ minWidth: 20, textAlign: "center" }}>{qty[t.id] || 0}</span>
                  <button
                    type="button"
                    onClick={() => setTicket(t.id, 1)}
                    aria-label={`Tilføj ${t.category}`}
                  >
                    +
                  </button>
                </span>
              </div>
            ))
          )}
          {totalTickets > 0 && (
            <p style={{ marginTop: 10, fontWeight: 600 }}>
              Gæsten skal betale {totalKr} kr.
            </p>
          )}
        </>
      )}

      <label style={label} htmlFor="eks-name">Gæstens navn *</label>
      <input id="eks-name" style={input} value={name} onChange={(e) => setName(e.target.value)} />

      <label style={label} htmlFor="eks-email">E-mail * (betalingslinket sendes hertil)</label>
      <input id="eks-email" style={input} value={email} onChange={(e) => setEmail(e.target.value)} />

      <label style={label} htmlFor="eks-phone">Telefon</label>
      <input id="eks-phone" style={input} value={phone} onChange={(e) => setPhone(e.target.value)} />

      <label style={label} htmlFor="eks-note">Note (intern, valgfri)</label>
      <input id="eks-note" style={input} value={note} onChange={(e) => setNote(e.target.value)} />

      {error && (
        <p style={{ color: "#a00", marginTop: 16 }} role="alert">{error}</p>
      )}
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
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={submitting}
            style={{
              padding: "8px 16px",
              background: "#8a1f2b",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Opret alligevel
          </button>
        </div>
      )}
      {result && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            border: "1px solid #0d3b2e",
            borderRadius: 6,
            background: "#f2f8f4",
          }}
          role="status"
        >
          <strong>Oprettet:</strong> {result.bookingNo} ({result.ticketBreakdown}),{" "}
          {result.totalKr} kr.
          <br />
          {result.emailed
            ? "Betalingslinket er sendt til gæsten på mail."
            : "Mailen kunne ikke sendes. Send linket herunder til gæsten på sms."}
          <div style={{ marginTop: 10, fontSize: 13, wordBreak: "break-all" }}>
            Betalingslink: <a href={result.betalingslink}>{result.betalingslink}</a>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.betalingslink);
                setKopieret(true);
              } catch {
                setKopieret(false);
              }
            }}
            style={{
              marginTop: 8,
              padding: "6px 12px",
              background: "#fff",
              border: "1px solid #0d3b2e",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {kopieret ? "Kopieret" : "Kopiér link (til sms)"}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => submit()}
        disabled={submitting}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          background: "#0d3b2e",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        {submitting ? "Opretter…" : "Opret og send betalingslink"}
      </button>
      </div>
    </div>
  );
}
