import { listRecords, TABLES, FIELDS, priceGroupName } from "@/lib/airtable";
import { listShowDates } from "@/lib/events";
import FribilletClient from "./FribilletClient";

export const dynamic = "force-dynamic";

// Personalets side til at udstede fribilletter. Bag samme simple ?key=-nøgle som
// resten af /admin. Gæster kan ikke nå den — og dermed ikke give sig selv
// gratis billetter.
export default async function FribilletPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const key = searchParams.key || "";
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return (
      <div style={{ padding: 48, fontFamily: "sans-serif" }}>
        <h1>Fribilletter — adgang</h1>
        <p>
          Tilføj din nøgle i URL&apos;en, fx{" "}
          <code>/admin/fribillet?key=DIN-NOEGLE</code>. Nøglen er den samme som
          til bordplanen (miljøvariablen <code>ADMIN_KEY</code>).
        </p>
      </div>
    );
  }

  // Kommende forestillinger (inkl. udsolgte — en æresgæst kan få plads til et
  // udsolgt show) og alle billettyper.
  const [shows, ticketTypeRecords] = await Promise.all([
    listShowDates(),
    listRecords(TABLES.ticketTypes),
  ]);
  const showList = shows.map((s) => ({
    id: s.id,
    title: s.title,
    date: s.date,
    time: s.time,
    priceGroup: s.priceGroup,
    soldOut: s.soldOut,
  }));
  const ticketTypes = ticketTypeRecords.map((r) => ({
    id: r.id,
    category: String(r.fields[FIELDS.ticketType.category] ?? ""),
    priceGroup: priceGroupName(r.fields[FIELDS.ticketType.priceGroup]),
  }));

  return (
    <FribilletClient shows={showList} ticketTypes={ticketTypes} adminKey={key} />
  );
}
