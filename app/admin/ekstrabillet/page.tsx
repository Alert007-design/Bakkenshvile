import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listRecords, TABLES, FIELDS, priceGroupName } from "@/lib/airtable";
import { listShowDates } from "@/lib/events";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import EkstrabilletClient from "./EkstrabilletClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

// Personalets side til ekstra betalte billetter (ud over kapaciteten). Bag den
// fælles login-session (middleware håndhæver den også).

type Soeg = Record<string, string | string[] | undefined>;

function enkelt(v: string | string[] | undefined, maks: number): string {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim().slice(0, maks) : "";
}

export default async function EkstrabilletPage({ searchParams = {} }: { searchParams?: Soeg }) {
  let session = null;
  try {
    session = verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
  } catch {
    session = null;
  }
  if (!session) redirect("/login?next=/admin/ekstrabillet");

  // Kommende forestillinger (inkl. udsolgte – det er netop dem, ekstrabilletter
  // bruges til) og alle billettyper. Prisen vises kun til orientering; serveren
  // beregner den igen ved oprettelsen.
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
    prisKr:
      Number(r.fields[FIELDS.ticketType.price] ?? 0) +
      Number(r.fields[FIELDS.ticketType.fee] ?? 0),
  }));

  return (
    <EkstrabilletClient
      shows={showList}
      ticketTypes={ticketTypes}
      csrf={session.csrf}
      start={{
        showId: enkelt(searchParams.show, 40),
        navn: enkelt(searchParams.navn, 120),
        email: enkelt(searchParams.email, 200),
        telefon: enkelt(searchParams.tlf, 40),
        tilhoerer: enkelt(searchParams.tilhoerer, 40),
      }}
    />
  );
}
