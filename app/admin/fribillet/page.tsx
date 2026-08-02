import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listRecords, TABLES, FIELDS, priceGroupName } from "@/lib/airtable";
import { listShowDates } from "@/lib/events";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import FribilletClient from "./FribilletClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

// Personalets side til at udstede fribilletter. Bag den fælles login-session
// (middleware håndhæver den også). Gæster kan ikke nå den — og dermed ikke give
// sig selv gratis billetter.
export default async function FribilletPage() {
  let session = null;
  try {
    session = verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
  } catch {
    session = null;
  }
  if (!session) redirect("/login?next=/admin/fribillet");

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
    <FribilletClient
      shows={showList}
      ticketTypes={ticketTypes}
      csrf={session.csrf}
    />
  );
}
