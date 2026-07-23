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
};

export default function AdminClient({
  shows,
  adminKey,
}: {
  shows: Show[];
  adminKey: string;
}) {
  const [showId, setShowId] = useState(shows[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!showId) return;
    setLoading(true);
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

  const totalGuests = rows.reduce((sum, r) => sum + r.ticketCount, 0);

  return (
    <div style={{ padding: "32px 40px", fontFamily: "sans-serif", color: "#1a1a16" }}>
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
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
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

      <div className="no-print">
        <h2>Tildel borde</h2>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
              <th style={{ padding: 8 }}>Booking</th>
              <th style={{ padding: 8 }}>Kunde</th>
              <th style={{ padding: 8 }}>Antal</th>
              <th style={{ padding: 8 }}>Match-info</th>
              <th style={{ padding: 8 }}>Bord</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>{r.bookingNo}</td>
                <td style={{ padding: 8 }}>
                  {r.customerName}
                  <br />
                  <span style={{ color: "#999", fontSize: 12 }}>
                    {r.customerPhone}
                  </span>
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
              </tr>
            ))}
          </tbody>
        </table>
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
                  {g.wantsMatching && g.note ? ` (${g.note})` : ""}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
