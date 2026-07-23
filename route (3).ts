import { listRecords, TABLES, FIELDS } from "@/lib/airtable";
import BookingClient from "../components/BookingClient";
import BookingShell from "../components/BookingShell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [events, ticketTypes, addOns] = await Promise.all([
    listRecords(TABLES.events),
    listRecords(TABLES.ticketTypes),
    listRecords(TABLES.addOns),
  ]);

  const showDates = events
    .map((r) => ({
      id: r.id,
      title: String(r.fields[FIELDS.event.title] ?? "Kommende show"),
      date: String(r.fields[FIELDS.event.date] ?? ""),
      time: String(r.fields[FIELDS.event.time] ?? ""),
      duration: String(r.fields[FIELDS.event.duration] ?? ""),
      notes: String(r.fields[FIELDS.event.notes] ?? ""),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const tickets = ticketTypes.map((r) => ({
    id: r.id,
    category: String(r.fields[FIELDS.ticketType.category] ?? ""),
    price: Number(r.fields[FIELDS.ticketType.price] ?? 0),
    fee: Number(r.fields[FIELDS.ticketType.fee] ?? 0),
    maxCount: Number(r.fields[FIELDS.ticketType.maxCount] ?? 0),
  }));

  const addons = addOns.map((r) => ({
    id: r.id,
    name: String(r.fields[FIELDS.addOn.name] ?? ""),
    price: Number(r.fields[FIELDS.addOn.price] ?? 0),
    category: String(r.fields[FIELDS.addOn.category] ?? "Andet"),
  }));

  return (
    <BookingShell>
      <BookingClient showDates={showDates} tickets={tickets} addons={addons} />
    </BookingShell>
  );
}
