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

  const events = await listRecords(TABLES.events);
  const shows = events
    .map((r) => ({
      id: r.id,
      title: String(r.fields[FIELDS.event.title] ?? ""),
      date: String(r.fields[FIELDS.event.date] ?? ""),
      time: String(r.fields[FIELDS.event.time] ?? ""),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return <AdminClient shows={shows} adminKey={key} />;
}
