import { listRecords, TABLES, FIELDS, priceGroupName } from "@/lib/airtable";
import { listShowDates } from "@/lib/events";
import { onlineDiscountActive } from "@/lib/genbestil";
import BookingClient from "../components/BookingClient";
import BookingShell from "../components/BookingShell";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Kun kommende datoer vises i billetkøbet — afholdte forestillinger filtreres
  // fra i den fælles kilde (lib/events).
  const [shows, ticketTypes, addOns] = await Promise.all([
    listShowDates(),
    listRecords(TABLES.ticketTypes),
    listRecords(TABLES.addOns),
  ]);

  const showDates = shows.map((s) => ({
    ...s,
    // Onlinerabatten på drikkevarer er kun aktiv indtil kl. 12.00 dansk tid
    // på forestillingsdagen. Beregnes serverside (per request, da siden er
    // force-dynamic), så visningen matcher det checkout håndhæver.
    discountActive: s.date ? onlineDiscountActive(s.date) : false,
  }));

  const tickets = ticketTypes.map((r) => ({
    id: r.id,
    category: String(r.fields[FIELDS.ticketType.category] ?? ""),
    price: Number(r.fields[FIELDS.ticketType.price] ?? 0),
    fee: Number(r.fields[FIELDS.ticketType.fee] ?? 0),
    maxCount: Number(r.fields[FIELDS.ticketType.maxCount] ?? 0),
    priceGroup: priceGroupName(r.fields[FIELDS.ticketType.priceGroup]),
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
