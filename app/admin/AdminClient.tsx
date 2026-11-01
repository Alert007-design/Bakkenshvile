"use client";

import { useEffect, useMemo, useState } from "react";
import {
  lavBordforslag,
  bordTekstPrBooking,
  MAKS_PR_BORD,
  type BordIForslag,
} from "@/lib/bordforslag";
import {
  delPaaKategorier,
  kundeBemaerkning,
  sorterEfterBestilt,
  UKENDT_KATEGORI,
} from "@/lib/gaesteliste";
import { TABLES } from "@/lib/tables";

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
  /** Aftenens faste gæstenummer; null for forladte kurve m.m. */
  gaestenummer: number | null;
  /** Bestillingstidspunkt (ISO). */
  bestilt: string;
  /** Feltet "Særlige ønsker" som det står i Airtable. */
  specialRequests: string;
  /** Forudbestilte drikkevarer, fx "Øl x2, Husets vin x1". */
  addons: string;
};

/**
 * Én linje i en kategori. En booking med billetter i flere kategorier står
 * én gang i hver, med det antal, der hører til kategorien.
 */
type Linje = Row & { antalIKategori: number };

// Salens rækker forfra og bagud, med bordene i rækkefølge (lib/tables.ts).
const SALENS_RAEKKER: number[][] = Array.from(
  new Set(TABLES.map((t) => t.row))
).map((r) =>
  TABLES.filter((t) => t.row === r)
    .sort((a, b) => a.position - b.position)
    .map((t) => t.number)
);

function nummerTekst(r: Row): string {
  if (r.gaestenummer === null) return "–";
  return `${r.gaestenummer}${kundeBemaerkning(r.specialRequests) ? "*" : ""}`;
}

function harDrikkevarer(r: Row): boolean {
  return r.addons.trim().length > 0;
}

const drikMaerke: React.CSSProperties = {
  marginLeft: 6,
  fontSize: 11,
  background: "#0d3b2e",
  color: "#fff",
  padding: "1px 6px",
  borderRadius: 10,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

// En booking er en fribillet, hvis bookingnummeret har fribillet-præfikset
// (sat af /api/admin/comp).
function isComp(bookingNo: string): boolean {
  return bookingNo.startsWith("BH-FRI-");
}

export default function AdminClient({
  shows,
  csrf,
  categoryOrder,
}: {
  shows: Show[];
  csrf: string;
  categoryOrder: string[];
}) {
  const [showId, setShowId] = useState(shows[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [tilbage, setTilbage] = useState<Record<string, number> | null>(null);
  const [nummerFejl, setNummerFejl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<BordIForslag<Linje>[] | null>(null);
  const [applying, setApplying] = useState(false);
  // Status pr. booking for "gensend billet"-knappen.
  const [resend, setResend] = useState<Record<string, "sending" | "sent" | "error">>({});

  useEffect(() => {
    if (!showId) return;
    setLoading(true);
    setSuggestion(null);
    fetch(`/api/admin/bookings?showId=${encodeURIComponent(showId)}`)
      .then((r) => r.json())
      .then((data) => {
        setRows(data.rows || []);
        setTilbage(data.tilbage ?? null);
        setNummerFejl(Boolean(data.nummerFejl));
      })
      .finally(() => setLoading(false));
  }, [showId]);

  async function saveTable(bookingId: string, tableNumber: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === bookingId ? { ...r, tableNumber } : r))
    );
    await fetch(`/api/admin/bookings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ bookingId, tableNumber }),
    });
  }

  // Gensender billet-mailen til bookingens kunde (henter email + linjer
  // serverside). Nyttigt hvis gæsten har mistet mailen, eller efter en fribillet.
  async function resendTicket(bookingId: string) {
    setResend((p) => ({ ...p, [bookingId]: "sending" }));
    try {
      const res = await fetch(`/api/admin/resend-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
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
    const map = new Map<string, Linje[]>();
    for (const r of sorterEfterBestilt(rows)) {
      for (const del of delPaaKategorier(r.ticketBreakdown, r.ticketCount)) {
        if (!map.has(del.kategori)) map.set(del.kategori, []);
        map.get(del.kategori)!.push({ ...r, antalIKategori: del.antal });
      }
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
    // Hver kategoridel placeres for sig med sit eget antal; en opdelt booking
    // får derfor bordnumre i begge dele af salen ("12+101").
    const grupper: [string, Linje[]][] = catsSorted.map((cat) => [
      cat,
      (byCategory.find(([c]) => c === cat)?.[1] ?? []).map((l) => ({
        ...l,
        ticketCount: l.antalIKategori,
      })),
    ]);
    const result = lavBordforslag(grupper);
    setSuggestion(result);
  }

  async function applySuggestion() {
    if (!suggestion) return;
    setApplying(true);
    try {
      const tekster = bordTekstPrBooking(suggestion);
      for (const [bookingId, bord] of Array.from(tekster.entries())) {
        await saveTable(bookingId, bord);
      }
    } finally {
      setApplying(false);
    }
  }

  const totalGuests = rows.reduce((sum, r) => sum + r.ticketCount, 0);
  const suggestionTableCount = suggestion
    ? suggestion.length
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

      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          fontSize: 14,
        }}
      >
        <a href="/funktioner" style={{ color: "#0d3b2e", fontWeight: 600 }}>
          ← Funktioner
        </a>
        <a href="/admin/opslag" style={{ color: "#0d3b2e", fontWeight: 600 }}>
          Slå en booking op
        </a>
        <a href="/api/auth/logout" style={{ color: "#8a1f2b", fontWeight: 600 }}>
          Log ud
        </a>
      </div>

      <div className="no-print" style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 4 }}>Bordplan</h1>
        <p style={{ color: "#666", marginTop: 0 }}>
          Vælg en visning, tildel bordnumre, og print planen inden showet.
          Bookingerne herunder står grupperet efter billetkategori, dyreste
          først, og inden for hver kategori med den først bestilte øverst.
          Nummeret foran er gæstens faste nummer for aftenen. En stjerne betyder,
          at gæsten har skrevet en bemærkning; den står under listen.
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
      {nummerFejl && (
        <p className="no-print" style={{ color: "#8a1f2b" }}>
          Nye gæstenumre kunne ikke gemmes lige nu. Bookinger uden nummer står med en
          streg. Genindlæs siden om lidt, så prøves der igen.
        </p>
      )}

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
                Det er kun et forslag, og alt kan flyttes på dagen. Højst 5
                ved et bord. Større selskaber fylder et bord med 5 og får
                resten ved nabobordet, fx 7 som 5+2. Sidder én fra et selskab
                alene, kommer et par eller et selskab på 3 med ved bordet.
                Enlige sættes sammen ved et bord med et par, ellers med et
                selskab på 3. Gæster, der har svaret på
                matchspørgsmålene, sættes sammen efter alder, egn,
                drikkevarer og interesser. Bruger du forslaget, overskrives
                de nuværende bordnumre for denne forestilling.
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
          {(() => {
            // Forslaget vises som salen: én linje pr. række, bordene i
            // rækkefølge (11-15, 21-25 ... 101-102). Tomme borde står som
            // tomme felter, så rækkerne flugter. Ekstra borde står til sidst.
            const prBord = new Map<number, BordIForslag<Linje>>();
            for (const g of suggestion) if (g.table !== null) prBord.set(g.table, g);
            const ekstra = suggestion.filter((g) => g.table === null);
            const kort = (g: BordIForslag<Linje>) => {
              const used = g.pladser.reduce((s, p) => s + p.antal, 0);
              return (
                <div
                  key={g.label}
                  style={{
                    background: "white",
                    border: "1px solid #e5e0d0",
                    borderRadius: 4,
                    padding: 10,
                    fontSize: 12,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    {g.label}
                    <span style={{ color: "#999", fontWeight: 400 }}>
                      {" "}
                      ({used}/{MAKS_PR_BORD})
                    </span>
                  </div>
                  {g.pladser.map(({ row: r, antal }) => (
                    <div key={r.id} style={{ color: "#555", marginBottom: 2 }}>
                      <strong>{nummerTekst(r)}</strong> {r.customerName} – {antal} pers.
                      {antal < r.antalIKategori ? ` (af ${r.antalIKategori})` : ""}
                      {harDrikkevarer(r) ? " · drikkevarer" : ""}
                    </div>
                  ))}
                </div>
              );
            };
            const tomt = (nr: number) => (
              <div
                key={`tom-${nr}`}
                style={{
                  border: "1px dashed #e5e0d0",
                  borderRadius: 4,
                  padding: 10,
                  fontSize: 12,
                  color: "#bbb",
                }}
              >
                Bord {nr}
              </div>
            );
            return (
              <div style={{ overflowX: "auto" }}>
                {SALENS_RAEKKER.map((raekke, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, minmax(150px, 1fr))",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    {raekke.map((nr) => {
                      const g = prBord.get(nr);
                      return g ? kort(g) : tomt(nr);
                    })}
                  </div>
                ))}
                {ekstra.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, minmax(150px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {ekstra.map(kort)}
                  </div>
                )}
              </div>
            );
          })()}
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
            {tilbage && tilbage[category] !== undefined && (
              <span style={{ marginLeft: 12, fontSize: 13, color: "#555" }}>
                {tilbage[category] === 0
                  ? "Udsolgt"
                  : `${tilbage[category]} ${tilbage[category] === 1 ? "billet" : "billetter"} tilbage`}
              </span>
            )}
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
                  <th style={{ padding: 8 }}>Nr.</th>
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
                    <td style={{ padding: 8, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {nummerTekst(r)}
                    </td>
                    <td style={{ padding: 8 }}>
                      <a
                        href={`/admin/opslag?nr=${encodeURIComponent(r.bookingNo)}`}
                        target="_blank"
                        rel="noopener"
                        style={{ color: "#0d3b2e" }}
                      >
                        {r.bookingNo}
                      </a>
                      {r.status === "Ekstra – afventer betaling" && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            background: "#8a1f2b",
                            color: "#fff",
                            padding: "1px 6px",
                            borderRadius: 10,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Ekstra – afventer betaling
                        </span>
                      )}
                      {r.status === "Udløbet" && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            background: "#999",
                            color: "#fff",
                            padding: "1px 6px",
                            borderRadius: 10,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Udløbet – ikke betalt
                        </span>
                      )}
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
                      {harDrikkevarer(r) && <span style={drikMaerke}>Drikkevarer</span>}
                      <br />
                      <span style={{ color: "#999", fontSize: 12 }}>
                        {r.customerPhone}
                      </span>
                    </td>
                    <td style={{ padding: 8, fontSize: 12, color: "#555" }}>
                      {r.ticketBreakdown || "—"}
                    </td>
                    <td style={{ padding: 8 }}>
                      {r.antalIKategori}
                      {r.antalIKategori < r.ticketCount && (
                        <span style={{ color: "#999", fontSize: 12 }}> af {r.ticketCount}</span>
                      )}
                    </td>
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

      {(() => {
        // Oversigt under gæstelisten: kundens bemærkninger og forudbestilte
        // drikkevarer, i gæstenummerorden. Vises også på udskriften.
        const iNummerOrden = [...sorterEfterBestilt(rows)].sort(
          (a, b) => (a.gaestenummer ?? Infinity) - (b.gaestenummer ?? Infinity)
        );
        const medBemaerkning = iNummerOrden.filter((r) => kundeBemaerkning(r.specialRequests));
        const medDrikkevarer = iNummerOrden.filter(harDrikkevarer);
        const celle: React.CSSProperties = { padding: "6px 8px", verticalAlign: "top" };
        return (
          <div style={{ marginTop: 32 }}>
            <h2>Bemærkninger fra gæsterne</h2>
            {medBemaerkning.length === 0 ? (
              <p style={{ color: "#999" }}>Ingen bemærkninger til denne forestilling.</p>
            ) : (
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
                <tbody>
                  {medBemaerkning.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ ...celle, fontWeight: 700, whiteSpace: "nowrap" }}>{nummerTekst(r)}</td>
                      <td style={{ ...celle, whiteSpace: "nowrap" }}>
                        {r.customerName}
                        <div style={{ color: "#999", fontSize: 12 }}>{r.bookingNo}</div>
                      </td>
                      <td style={{ ...celle, whiteSpace: "pre-line" }}>
                        {kundeBemaerkning(r.specialRequests)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2 style={{ marginTop: 28 }}>Forudbestilte drikkevarer</h2>
            {medDrikkevarer.length === 0 ? (
              <p style={{ color: "#999" }}>Ingen har forudbestilt drikkevarer til denne forestilling.</p>
            ) : (
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
                <tbody>
                  {medDrikkevarer.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ ...celle, fontWeight: 700, whiteSpace: "nowrap" }}>{nummerTekst(r)}</td>
                      <td style={{ ...celle, whiteSpace: "nowrap" }}>
                        {r.customerName}
                        <div style={{ color: "#999", fontSize: 12 }}>
                          {r.tableNumber ? `Bord ${r.tableNumber}` : "Intet bord endnu"}
                        </div>
                      </td>
                      <td style={celle}>
                        {r.addons.split(",").map((v) => v.trim()).filter(Boolean).map((v, i) => (
                          <div key={i}>{v}</div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })()}

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
                  <strong>{nummerTekst(g)}</strong> {g.customerName} – {g.ticketCount} pers.
                  {g.ticketBreakdown ? ` (${g.ticketBreakdown})` : ""}
                  {isComp(g.bookingNo) ? " · fribillet" : ""}
                  {harDrikkevarer(g) ? " · drikkevarer" : ""}
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
