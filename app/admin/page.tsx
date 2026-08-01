import { listRecords, TABLES, FIELDS } from "@/lib/airtable";
import { listShowDates } from "@/lib/events";
import AdminClient from "./AdminClient";
export const dynamic = "force-dynamic";
export default async function AdminPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const key = searchParams.key || "";
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return (
      <div style={{ padding: 48, fontFamily: "sans-serif" }}>
        <h1>Bordplan — adgang</h1>
        <p>
          Tilføj din nøgle i URL&apos;en, fx{" "}
          <code>/admin?key=DIN-NOEGLE</code>. Nøglen sættes som miljøvariablen{" "}
          <code>ADMIN_KEY</code> i Vercel.
        </p>
      </div>
    );
  }
  // Bordplanen skal også kunne slå afholdte shows op, så her tages afholdte
  // datoer med (includePast). Den fælles kilde sorterer kronologisk.
  const [showDates, ticketTypes] = await Promise.all([
    listShowDates({ includePast: true }),
    listRecords(TABLES.ticketTypes),
  ]);
  const shows = showDates.map((s) => ({
    id: s.id,
    title: s.title,
    date: s.date,
    time: s.time,
  }));

  // Kategori-rækkefølge, dyreste først — samme sortering som på
  // selve bookingsiden. Bruges af AdminClient til at gruppere
  // bordplanen efter kategori (A+, A, B ...), i stedet for at
  // gætte ud fra bogstaverne alene.
  const categoryOrder = [...ticketTypes]
    .map((r) => ({
      category: String(r.fields[FIELDS.ticketType.category] ?? ""),
      price: Number(r.fields[FIELDS.ticketType.price] ?? 0),
      fee: Number(r.fields[FIELDS.ticketType.fee] ?? 0),
    }))
    .sort((a, b) => b.price + b.fee - (a.price + a.fee))
    .map((t) => t.category)
    .filter(Boolean);

  return (
    <AdminClient shows={shows} adminKey={key} categoryOrder={categoryOrder} />
  );
}
