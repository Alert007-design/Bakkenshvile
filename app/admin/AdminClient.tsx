"use client";

import { useEffect, useMemo, useState } from "react";

type Show = { id: string; title: string; date: string; time: string };

type Row = {
  id: string;
  bookingNo: string;
  ticketCount: number;
  status: string;
  tableNumber: string;
  wantsMatching: boolean;
  ageGroup: string;
  location: string;
  interests: string;
  drinkPreference: string;
  note: string;
  customerName: string;
  customerPhone: string;
  // Nedbrydning af billetter pr. kategori, fx "A+ x2, B x1".
  ticketBreakdown: string;
};

const UKENDT_KATEGORI = "Ukendt kategori";

// Antaget maks. antal personer pr. bord i salen (5-6 personer).
// Sæt til 6 — algoritmen forsøger stadig at fylde borde effektivt,
// selv når et bord reelt kun har plads til 5.
const TABLE_CAPACITY = 6;

// Bookingens primære (dyreste) kategori — det første segment i
// ticketBreakdown, da checkout-koden allerede skriver kategorierne i
// dyreste-først-rækkefølge.
function primaryCategory(row: Row): string {
  if (!row.ticketBreakdown) return UKENDT_KATEGORI;
  const first = row.ticketBreakdown.split(",")[0]?.trim() ?? "";
  const match = first.match(/^(.+?)\s+x\d+$/);
  return match ? match[1].trim() : first || UKENDT_KATEGORI;
}

// En booking er en fribillet, hvis bookingnummeret har fribillet-præfikset
// (sat af /api/admin/comp).
function isComp(bookingNo: string): boolean {
  return bookingNo.startsWith("BH-FRI-");
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function interestTokens(s: string): string[] {
  return normalize(s)
    .split(/[,;/]| og /)
    .map((t) => t.trim())
    .filter(Boolean);
}

// Hvor godt to bookinger passer sammen ved samme bord, baseret på de
// frivillige matchsvar. Kun bookinger der har sagt ja til at blive
// matchet, tæller med i scoren — resten placeres udelukkende efter
// pladseffektivitet.
function affinity(a: Row, b: Row): number {
  if (!a.wantsMatching || !b.wantsMatching) return 0;
  let score = 0;
  if (a.ageGroup && a.ageGroup === b.ageGroup) score += 3;
  if (a.location && normalize(a.location) === normalize(b.location)) score += 2;
  if (
    a.drinkPreference &&
    a.drinkPreference === b.drinkPreference
  )
    score += 2;
  const aInterests = interestTokens(a.interests);
  const bInterests = interestTokens(b.interests);
  const shared = aInterests.filter((t) => bInterests.includes(t));
  score += Math.min(shared.length, 3);
  return score;
}

type TableGroup = { table: number; category: string; rows: Row[] };

// Pakker bookinger inden for én kategori ind i borde: største selskaber
// først (for at udnytte pladsen bedst muligt), og for hvert selskab
// vælges det bord, hvor det matcher bedst med dem, der allerede sidder
// der (blandt de borde, der har plads). Et nyt bord åbnes kun, hvis
// ingen eksisterende bord har plads.
function packCategory(rows: Row[]): Row[][] {
  const remaining = [...rows].sort((a, b) => b.ticketCount - a.ticketCount);
  const bins: { rows: Row[]; used: number }[] = [];

  for (const row of remaining) {
    let bestBin: { rows: Row[]; used: number } | null = null;
    let bestScore = -Infinity;
    for (const bin of bins) {
      const free = TABLE_CAPACITY - bin.used;
      if (free < row.ticketCount) continue;
      let score = 0;
      for (const existing of bin.rows) score += affinity(row, existing);
      // Let præference for borde der bliver fyldt godt op.
      score += (TABLE_CAPACITY - free) * 0.01;
      if (score > bestScore) {
        bestScore = score;
        bestBin = bin;
      }
    }
    if (bestBin) {
      bestBin.rows.push(row);
      bestBin.used += row.ticketCount;
    } else {
      bins.push({ rows: [row], used: row.ticketCount });
    }
  }
  return bins.map((b) => b.rows);
}

export default function AdminClient({
  shows,
  adminKey,
  categoryOrder,
}: {
  shows: Show[];
  adminKey: string;
  categoryOrder: string[];
}) {
  const [showId, setShowId] = useState(shows[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<TableGroup[] | null>(null);
  const [applying, setApplying] = useState(false);
  // Status pr. booking for "gensend billet"-knappen.
  const [resend, setResend] = useState<Record<string, "sending" | "sent" | "error">>({});

  useEffect(() => {
    if (!showId) return;
    setLoading(true);
    setSuggestion(null);
    fetch(`/api/admin/bookings?showId=${showId}&key=${adminKey}`)
      .then((r) => r.json())
      .then((data) => setRows(data.rows || []))
      .finally(() => setLoading(false));
  }, [showId, adminKey]);

  async function saveTable(bookingId: string, tableNumber: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === bookingId ? { ...r, tableNumber } : r))
    );
    await fetch(`/api/admin/bookings?key=${adminKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, tableNumber }),
    });
  }

  // Gensender billet-mailen til bookingens kunde (henter email + linjer
  // serverside). Nyttigt hvis gæsten har mistet mailen, eller efter en fribillet.
  async function resendTicket(bookingId: string) {
    setResend((p) => ({ ...p, [bookingId]: "sending" }));
    try {
      const res = await fetch(`/api/admin/resend-ticket?key=${adminKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResend((p) => ({ ...p, [bookingId]: "error" }));
        alert(data.error || "Kunne ikke gensende billetten.");
        return;
      }
      setResend((p) => ({ ...p, [bookingId]: "sent" }));
    } catch {
      setResend((p) => ({ ...p, [bookingId]: "error" }));
      alert("Kunne ikke gensende billetten.");
    }
  }

  const byTable = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.tableNumber?.trim() || "Ikke tildelt";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "Ikke tildelt") return 1;
      if (b === "Ikke tildelt") return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [rows]);

  // Bookinger grupperet efter billetkategori, i samme rækkefølge som
  // kategorierne er prissat (dyreste først). Ukendte/blandede kategorier
  // havner sidst.
  const byCategory = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = primaryCategory(r);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const orderIndex = new Map(categoryOrder.map((c, i) => [c, i]));
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ai = orderIndex.has(a) ? orderIndex.get(a)! : Infinity;
      const bi = orderIndex.has(b) ? orderIndex.get(b)! : Infinity;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });
  }, [rows, categoryOrder]);

  function generateSuggestion() {
    const orderIndex = new Map(categoryOrder.map((c, i) => [c, i]));
    const catsSorted = byCategory.map(([cat]) => cat).sort((a, b) => {
      const ai = orderIndex.has(a) ? orderIndex.get(a)! : Infinity;
      const bi = orderIndex.has(b) ? orderIndex.get(b)! : Infinity;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });
    let tableCounter = 1;
    const result: TableGroup[] = [];
    for (const cat of catsSorted) {
      const catRows = byCategory.find(([c]) => c === cat)?.[1] ?? [];
      const bins = packCategory(catRows);
      for (const bin of bins) {
        result.push({ table: tableCounter, category: cat, rows: bin });
        tableCounter++;
      }
    }
    setSuggestion(result);
  }

  async function applySuggestion() {
    if (!suggestion) return;
    setApplying(true);
    try {
      for (const group of suggestion) {
        for (const row of group.rows) {
          await saveTable(row.id, String(group.table));
        }
      }
    } finally {
      setApplying(false);
    }
  }

  const totalGuests = rows.reduce((sum, r) => sum + r.ticketCount, 0);
  const suggestionTableCount = suggestion
    ? new Set(suggestion.map((g) => g.table)).size
    : 0;

  return (
    <div
      style={{
        padding: "32px 40px",
        fontFamily: "sans-serif",
        color: "#1a1a16",
        background: "#fff",
        minHeight: "100vh",
      }}
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 4 }}>Bordplan</h1>
        <p style={{ color: "#666", marginTop: 0 }}>
          Vælg en visning, tildel bordnumre, og print planen inden showet.
          Bookingerne herunder står grupperet efter billetkategori, dyreste
          først.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={showId}
            onChange={(e) => setShowId(e.target.value)}
            style={{ padding: 8, fontSize: 14 }}
          >
            {shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date} kl. {s.time}
              </option>
            ))}
          </select>
          <button
            onClick={generateSuggestion}
            disabled={loading || rows.length === 0}
            style={{
              padding: "8px 16px",
              background: "#c9a227",
              color: "#1a1a16",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Foreslå bordplacering
          </button>
          <button
            onClick={() => window.print()}
            style={{
              padding: "8px 16px",
              background: "#0d3b2e",
              color: "white",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            Print bordplan
          </button>
          <span style={{ fontSize: 13, color: "#666" }}>
            {rows.length} bookinger · {totalGuests} gæster
          </span>
        </div>
      </div>

      {loading && <p>Henter...</p>}

      {suggestion && (
        <div
          className="no-print"
          style={{
            marginBottom: 32,
            padding: 20,
            background: "#faf7ee",
            border: "1px solid #c9a227",
            borderRadius: 4,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>
                Forslag: {suggestionTableCount} borde
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                Størst selskaber og bedst pladsudnyttelse går forud; gæster der
                har svaret på matchspørgsmålene, samles ud fra alder,
                geografi, drikkepræference og interesser. Tjek forslaget
                igennem, inden du bruger det — det overskriver de nuværende
                bordnumre for denne visning.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={applySuggestion}
                disabled={applying}
                style={{
                  padding: "8px 16px",
                  background: "#0d3b2e",
                  color: "white",
                  border: "none",
                  borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                {applying ? "Gemmer..." : "Brug dette forslag"}
              </button>
              <button
                onClick={() => setSuggestion(null)}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  color: "#666",
                  border: "1px solid #ccc",
                  borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                Kassér
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {suggestion.map((g) => {
              const used = g.rows.reduce((s, r) => s + r.ticketCount, 0);
              return (
                <div
                  key={g.table}
                  style={{
                    background: "white",
                    border: "1px solid #e5e0d0",
                    borderRadius: 4,
                    padding: 12,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    Bord {g.table} · {g.category}
                    <span style={{ color: "#999", fontWeight: 400 }}>
                      {" "}
                      ({used}/{TABLE_CAPACITY})
                    </span>
                  </div>
                  {g.rows.map((r) => (
                    <div key={r.id} style={{ color: "#555", marginBottom: 2 }}>
                      {r.customerName} — {r.ticketCount} pers.
                      {r.wantsMatching && r.ageGroup ? ` · ${r.ageGroup}` : ""}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="no-print">
        <h2>Tildel borde</h2>
        {byCategory.map(([category, categoryRows]) => (
          <div key={category} style={{ marginBottom: 28 }}>
            <h3
              style={{
                marginBottom: 8,
                fontSize: 15,
                color: "#0d3b2e",
                borderBottom: "2px solid #c9a227",
                paddingBottom: 4,
                display: "inline-block",
              }}
            >
              {category}
            </h3>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
                  <th style={{ padding: 8 }}>Booking</th>
                  <th style={{ padding: 8 }}>Kunde</th>
                  <th style={{ padding: 8 }}>Billetter</th>
                  <th style={{ padding: 8 }}>Antal gæster</th>
                  <th style={{ padding: 8 }}>Match-info</th>
                  <th style={{ padding: 8 }}>Bord</th>
                  <th style={{ padding: 8 }}>Billet</th>
                </tr>
              </thead>
              <tbody>
                {categoryRows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>
                      {r.bookingNo}
                      {isComp(r.bookingNo) && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            background: "#c9a227",
                            color: "#1a1a16",
                            padding: "1px 6px",
                            borderRadius: 10,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Fribillet
                        </span>
                      )}
                    </td>
                    <td style={{ padding: 8 }}>
                      {r.customerName}
                      <br />
                      <span style={{ color: "#999", fontSize: 12 }}>
                        {r.customerPhone}
                      </span>
                    </td>
                    <td style={{ padding: 8, fontSize: 12, color: "#555" }}>
                      {r.ticketBreakdown || "—"}
                    </td>
                    <td style={{ padding: 8 }}>{r.ticketCount}</td>
                    <td style={{ padding: 8, fontSize: 12, color: "#555" }}>
                      {r.wantsMatching ? (
                        <>
                          {r.ageGroup && <div>Alder: {r.ageGroup}</div>}
                          {r.location && <div>Fra: {r.location}</div>}
                          {r.drinkPreference && <div>Drik: {r.drinkPreference}</div>}
                          {r.interests && <div>Interesser: {r.interests}</div>}
                          {r.note && <div>Note: {r.note}</div>}
                        </>
                      ) : (
                        <span style={{ color: "#bbb" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: 8 }}>
                      <input
                        defaultValue={r.tableNumber}
                        placeholder="fx 1"
                        style={{ width: 60, padding: 4 }}
                        onBlur={(e) => saveTable(r.id, e.target.value)}
                      />
                    </td>
                    <td style={{ padding: 8 }}>
                      <button
                        onClick={() => resendTicket(r.id)}
                        disabled={resend[r.id] === "sending"}
                        style={{
                          padding: "4px 10px",
                          fontSize: 12,
                          background: resend[r.id] === "sent" ? "#0d3b2e" : "#eee",
                          color: resend[r.id] === "sent" ? "white" : "#1a1a16",
                          border: "1px solid #ccc",
                          borderRadius: 3,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {resend[r.id] === "sending"
                          ? "Sender…"
                          : resend[r.id] === "sent"
                          ? "Sendt ✓"
                          : "Gensend billet"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40 }}>
        <h2>Printvenlig bordplan</h2>
        {byTable.map(([table, guests]) => (
          <div key={table} style={{ marginBottom: 20, breakInside: "avoid" }}>
            <h3 style={{ marginBottom: 6 }}>
              {table === "Ikke tildelt" ? table : `Bord ${table}`}
            </h3>
            <ul style={{ margin: 0 }}>
              {guests.map((g) => (
                <li key={g.id}>
                  {g.customerName} — {g.ticketCount} pers.
                  {g.ticketBreakdown ? ` (${g.ticketBreakdown})` : ""}
                  {isComp(g.bookingNo) ? " · fribillet" : ""}
                  {g.wantsMatching && g.note ? ` — ${g.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
