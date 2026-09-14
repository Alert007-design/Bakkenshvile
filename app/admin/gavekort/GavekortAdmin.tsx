"use client";

import { useMemo, useState } from "react";
import type { GiftCardRow } from "@/lib/gift-cards";

// Personale-oversigt: søg, se status og markér et betalt gavekort som brugt.
// Muterende kald sender csrf i x-csrf-token-headeren (serveren kræver det).

function kr(ore: number): string {
  return `${Math.round(ore / 100)} kr.`;
}

function daDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function statusLabel(card: GiftCardRow): string {
  if (card.status === "paid" && card.expiresAt && new Date(card.expiresAt).getTime() < Date.now()) {
    return "Udløbet";
  }
  switch (card.status) {
    case "pending": return "Afventer betaling";
    case "paid": return "Gyldigt";
    case "used": return "Brugt";
    case "failed": return "Fejlet";
    case "refunded": return "Refunderet";
    default: return card.status;
  }
}

const cellStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #e5e0d0",
  fontSize: 14,
  textAlign: "left",
  verticalAlign: "top",
};

export default function GavekortAdmin({
  initialCards,
  csrf,
}: {
  initialCards: GiftCardRow[];
  csrf: string;
}) {
  const [cards, setCards] = useState<GiftCardRow[]>(initialCards);
  const [q, setQ] = useState("");
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter(
      (c) =>
        (c.code ?? "").toLowerCase().includes(needle) ||
        c.recipientEmail.toLowerCase().includes(needle) ||
        c.purchaserEmail.toLowerCase().includes(needle) ||
        c.giftCardNo.toLowerCase().includes(needle) ||
        c.status.toLowerCase().includes(needle)
    );
  }, [cards, q]);

  async function markUsed(card: GiftCardRow) {
    if (!card.code) return;
    if (!confirm(`Markér gavekort ${card.code} (${kr(card.amountOre)}) som brugt?`)) return;
    setBusyRef(card.paymentRef);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/gavekort", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ code: card.code }),
      });
      const data = (await res.json()) as { card?: GiftCardRow; error?: string };
      if (!res.ok || !data.card) {
        setMessage(data.error ?? "Kunne ikke markere som brugt.");
      } else {
        setCards((prev) => prev.map((c) => (c.paymentRef === data.card!.paymentRef ? data.card! : c)));
        setMessage(`Gavekort ${data.card.code} er markeret som brugt.`);
      }
    } catch {
      setMessage("Netværksfejl — prøv igen.");
    } finally {
      setBusyRef(null);
    }
  }

  return (
    <div className="page" style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Gavekort</h1>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 16 }}>
        Indløsning i fase 1 er manuel: find gavekortet på koden, og markér det som
        brugt, når det indløses.
      </p>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Søg på kode, e-mail, nummer eller status"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "10px 12px",
          fontSize: 16,
          border: "1px solid #cfc8b6",
          borderRadius: 4,
          marginBottom: 16,
          boxSizing: "border-box",
        }}
      />

      {message && (
        <p role="status" style={{ fontSize: 14, marginBottom: 12, color: "#0d3b2e" }}>
          {message}
        </p>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...cellStyle, fontWeight: 700 }}>Kode</th>
              <th style={{ ...cellStyle, fontWeight: 700 }}>Beløb</th>
              <th style={{ ...cellStyle, fontWeight: 700 }}>Status</th>
              <th style={{ ...cellStyle, fontWeight: 700 }}>Modtager</th>
              <th style={{ ...cellStyle, fontWeight: 700 }}>Udløber</th>
              <th style={{ ...cellStyle, fontWeight: 700 }}>Handling</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={6}>
                  Ingen gavekort matcher søgningen.
                </td>
              </tr>
            )}
            {filtered.map((card) => (
              <tr key={card.paymentRef}>
                <td style={{ ...cellStyle, fontFamily: "monospace" }}>{card.code ?? "—"}</td>
                <td style={cellStyle}>{kr(card.amountOre)}</td>
                <td style={cellStyle}>{statusLabel(card)}</td>
                <td style={cellStyle}>{card.recipientEmail}</td>
                <td style={cellStyle}>{daDate(card.expiresAt)}</td>
                <td style={cellStyle}>
                  {card.status === "paid" ? (
                    <button
                      type="button"
                      onClick={() => markUsed(card)}
                      disabled={busyRef === card.paymentRef}
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        cursor: "pointer",
                        border: "1px solid #0d3b2e",
                        borderRadius: 4,
                        background: "#0d3b2e",
                        color: "#f6f1e4",
                        opacity: busyRef === card.paymentRef ? 0.6 : 1,
                      }}
                    >
                      {busyRef === card.paymentRef ? "…" : "Markér som brugt"}
                    </button>
                  ) : (
                    <span style={{ color: "#999", fontSize: 13 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
