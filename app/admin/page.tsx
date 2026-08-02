import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listRecords, TABLES, FIELDS } from "@/lib/airtable";
import { listShowDates } from "@/lib/events";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import AdminClient from "./AdminClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminPage() {
  // Adgang via den fælles personalesession (middleware håndhæver den også).
  // Ingen nøgle i URL'en. csrf sendes til klienten til muterende kald.
  let session = null;
  try {
    session = verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
  } catch {
    session = null;
  }
  if (!session) redirect("/login?next=/admin");

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
    <AdminClient shows={shows} csrf={session.csrf} categoryOrder={categoryOrder} />
  );
}
