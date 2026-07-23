import { listRecords, TABLES, FIELDS } from "@/lib/airtable";
import BookingClient from "./components/BookingClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [events, ticketTypes, addOns] = await Promise.all([
    listRecords(TABLES.events),
    listRecords(TABLES.ticketTypes),
    listRecords(TABLES.addOns),
  ]);

  const event = events[0]?.fields ?? {};

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
    <BookingClient
      event={{
        title: String(event[FIELDS.event.title] ?? "Kommende show"),
        date: String(event[FIELDS.event.date] ?? ""),
        time: String(event[FIELDS.event.time] ?? ""),
        duration: String(event[FIELDS.event.duration] ?? ""),
        notes: String(event[FIELDS.event.notes] ?? ""),
      }}
      tickets={tickets}
      addons={addons}
    />
  );
}
