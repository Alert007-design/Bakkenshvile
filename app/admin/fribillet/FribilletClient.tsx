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

export default function FribilletClient({
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
    { bookingNo: string; ticketBreakdown: string; emailed: boolean } | null
  >(null);

  const selectedShow = shows.find((s) => s.id === showId) ?? null;

  // Kun billettyper i den valgte forestillings prisgruppe.
  const visibleTickets = useMemo(() => {
    if (!selectedShow) return [];
    return ticketTypes.filter((t) => t.priceGroup === selectedShow.priceGroup);
  }, [ticketTypes, selectedShow]);

  const totalTickets = Object.values(qty).reduce((a, b) => a + b, 0);

  function setTicket(id: string, delta: number) {
    setQty((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) }));
  }

  function selectShow(id: string) {
    setShowId(id);
    setQty({}); // nulstil antal, så mængder fra en anden prisgruppe ikke følger med
    setError(null);
    setResult(null);
  }

  async function submit() {
    setError(null);
    setResult(null);
    if (!selectedShow) return setError("Vælg en forestilling.");
    if (!name.trim()) return setError("Skriv gæstens navn.");
    if (totalTickets === 0) return setError("Vælg mindst én billet.");

    const tickets = visibleTickets
      .filter((t) => qty[t.id])
      .map((t) => ({ ticketTypeId: t.id, quantity: qty[t.id] }));

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/comp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
          body: JSON.stringify({
            showId: selectedShow.id,
            tickets,
            customer: { name: name.trim(), email: email.trim(), phone: phone.trim() },
            note: note.trim() || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Noget gik galt");
      setResult(data);
      // Nulstil felterne til næste fribillet, men behold den valgte forestilling.
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
      <h1 style={{ fontSize: 24 }}>Udsted fribillet</h1>
      <p style={{ color: "#555", fontSize: 14 }}>
        Opretter en gratis booking (0 kr), markerer den betalt uden om betaling,
        og sender billet-mailen til gæsten, hvis der er en e-mail.
      </p>

      <label style={label} htmlFor="fri-show">Forestilling</label>
      <select
        id="fri-show"
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
                <span>{t.category}</span>
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
        </>
      )}

      <label style={label} htmlFor="fri-name">Gæstens navn *</label>
      <input id="fri-name" style={input} value={name} onChange={(e) => setName(e.target.value)} />

      <label style={label} htmlFor="fri-email">Email (til billet-mailen)</label>
      <input id="fri-email" style={input} value={email} onChange={(e) => setEmail(e.target.value)} />

      <label style={label} htmlFor="fri-phone">Telefon</label>
      <input id="fri-phone" style={input} value={phone} onChange={(e) => setPhone(e.target.value)} />

      <label style={label} htmlFor="fri-note">Note (intern, valgfri)</label>
      <input id="fri-note" style={input} value={note} onChange={(e) => setNote(e.target.value)} />

      {error && (
        <p style={{ color: "#a00", marginTop: 16 }} role="alert">{error}</p>
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
          <strong>Fribillet oprettet:</strong> {result.bookingNo} ({result.ticketBreakdown}).{" "}
          {result.emailed
            ? "Billet-mailen er sendt til gæsten."
            : "Ingen e-mail angivet — send selv bookingnummeret til gæsten."}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
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
        {submitting ? "Opretter…" : "Udsted fribillet"}
      </button>
      </div>
    </div>
  );
}
