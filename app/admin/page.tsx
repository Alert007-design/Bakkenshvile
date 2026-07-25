import { listRecords, TABLES, FIELDS } from "@/lib/airtable";
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
  const [events, ticketTypes] = await Promise.all([
    listRecords(TABLES.events),
    listRecords(TABLES.ticketTypes),
  ]);
  const shows = events
    .map((r) => ({
      id: r.id,
      title: String(r.fields[FIELDS.event.title] ?? ""),
      date: String(r.fields[FIELDS.event.date] ?? ""),
      time: String(r.fields[FIELDS.event.time] ?? ""),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

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
