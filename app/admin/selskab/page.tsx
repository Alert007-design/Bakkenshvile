import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listRecords, TABLES, FIELDS, priceGroupName } from "@/lib/airtable";
import { danishToday, listShowDates } from "@/lib/events";
import { kategoriFraAirtable } from "@/lib/kapacitet";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import SelskabClient from "./SelskabClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

// Personalets side til store selskaber med betalingsfrist. Bag den fælles
// login-session (middleware håndhæver den også).
export default async function SelskabPage() {
  let session = null;
  try {
    session = verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
  } catch {
    session = null;
  }
  if (!session) redirect("/login?next=/admin/selskab");

  const [shows, ticketTypeRecords] = await Promise.all([
    listShowDates(),
    listRecords(TABLES.ticketTypes),
  ]);
  return (
    <SelskabClient
      csrf={session.csrf}
      idag={danishToday()}
      shows={shows.map((s) => ({
        id: s.id,
        title: s.title,
        date: s.date,
        time: s.time,
        priceGroup: s.priceGroup,
      }))}
      ticketTypes={ticketTypeRecords.map((r) => ({
        id: r.id,
        category: String(r.fields[FIELDS.ticketType.category] ?? ""),
        priceGroup: priceGroupName(r.fields[FIELDS.ticketType.priceGroup]),
        kapacitetskategori: kategoriFraAirtable(r.fields[FIELDS.ticketType.kapacitetskategori]),
        prisKr:
          Number(r.fields[FIELDS.ticketType.price] ?? 0) +
          Number(r.fields[FIELDS.ticketType.fee] ?? 0),
      }))}
    />
  );
}
