// Server-side hjælpere til genbestilling (/genbestil).
// Håndterer nøglegenerering, login (ref+nøgle eller bestillingsnr+email),
// deadline (kl. 12.00 dansk tid på showdagen) og sammenlægning af tilvalg.

import { randomBytes, timingSafeEqual } from "crypto";
import { findRecords, getRecord, TABLES, FIELDS } from "@/lib/airtable";

type AirtableRecord = { id: string; fields: Record<string, unknown> };

// Ugættelig nøgle (32 tegn base64url = 24 tilfældige bytes).
export function generateBookingKey(): string {
  return randomBytes(24).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

async function findBookingByNo(bookingNo: string): Promise<AirtableRecord | null> {
  const safe = bookingNo.trim();
  // Kun bookingnumre i det kendte format — beskytter mod formel-injektion.
  if (!/^[A-Za-z0-9-]{1,40}$/.test(safe)) return null;
  const recs = await findRecords(
    TABLES.bookings,
    `{Bookingnr}="${safe}"`
  );
  return recs[0] ?? null;
}

export type AuthParams = {
  ref?: string;
  key?: string;
  bookingNo?: string;
  email?: string;
};

// Returnerer bookingen hvis legitimationen passer, ellers null.
// Kalderen svarer altid med den samme generiske fejl ved null, så det
// aldrig afsløres om det var nummeret, nøglen eller emailen der var forkert.
export async function authenticateBooking(
  p: AuthParams
): Promise<AirtableRecord | null> {
  if (p.ref && p.key) {
    const booking = await findBookingByNo(p.ref);
    if (!booking) return null;
    const stored = String(booking.fields[FIELDS.booking.key] ?? "");
    return safeEqual(stored, p.key) ? booking : null;
  }
  if (p.bookingNo && p.email) {
    const booking = await findBookingByNo(p.bookingNo);
    if (!booking) return null;
    const custId = (booking.fields[FIELDS.booking.customer] as
      | string[]
      | undefined)?.[0];
    if (!custId) return null;
    const cust = await getRecord(TABLES.customers, custId);
    const email = String(cust.fields[FIELDS.customer.email] ?? "")
      .trim()
      .toLowerCase();
    const given = p.email.trim().toLowerCase();
    return email && email === given ? booking : null;
  }
  return null;
}

// --- Deadline: kl. 12.00 Europe/Copenhagen på showdagen ---

function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {} as Record<string, string>;
  for (const part of parts) map[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === "24" ? "0" : map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

export function copenhagenNoon(dateIso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const naiveNoonUtc = Date.parse(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(naiveNoonUtc)) return null;
  const offset = tzOffsetMinutes(new Date(naiveNoonUtc), "Europe/Copenhagen");
  return new Date(naiveNoonUtc - offset * 60000);
}

// Genbestilling lukker kl. 12.00 dansk tid på showdagen (og dermed også
// efter at showet er afholdt). Ukendt dato → betragtes som lukket.
export function reorderClosed(showDateIso: string, now = new Date()): boolean {
  const deadline = copenhagenNoon(showDateIso);
  if (!deadline) return true;
  return now.getTime() >= deadline.getTime();
}

// --- Visning af bookingen på siden ---

export type BookingView = {
  bookingNo: string;
  name: string;
  showTitle: string;
  showDate: string;
  showTime: string;
  ticketCount: number;
  ticketBreakdown: string;
  existingAddons: string;
  deadlinePassed: boolean;
};

export async function buildBookingView(booking: AirtableRecord): Promise<BookingView> {
  const custId = (booking.fields[FIELDS.booking.customer] as
    | string[]
    | undefined)?.[0];
  const eventId = (booking.fields[FIELDS.booking.show] as
    | string[]
    | undefined)?.[0];
  const [cust, event] = await Promise.all([
    custId ? getRecord(TABLES.customers, custId) : Promise.resolve(null),
    eventId ? getRecord(TABLES.events, eventId) : Promise.resolve(null),
  ]);
  const showDate = event ? String(event.fields[FIELDS.event.date] ?? "") : "";
  return {
    bookingNo: String(booking.fields[FIELDS.booking.bookingNo] ?? ""),
    name: cust ? String(cust.fields[FIELDS.customer.name] ?? "") : "",
    showTitle: event ? String(event.fields[FIELDS.event.title] ?? "") : "",
    showDate,
    showTime: event ? String(event.fields[FIELDS.event.time] ?? "") : "",
    ticketCount: Number(booking.fields[FIELDS.booking.ticketCount] ?? 0),
    ticketBreakdown: String(booking.fields[FIELDS.booking.ticketBreakdown] ?? ""),
    existingAddons: String(booking.fields[FIELDS.booking.addons] ?? ""),
    deadlinePassed: showDate ? reorderClosed(showDate) : true,
  };
}

// --- Tilvalg som tekst (én linje pr. vare: "Navn x2") ---

export function addonBreakdown(
  lines: { name: string; quantity: number }[]
): string {
  const map = new Map<string, number>();
  for (const l of lines) {
    if (!l.name || !l.quantity) continue;
    map.set(l.name, (map.get(l.name) || 0) + l.quantity);
  }
  return Array.from(map.entries())
    .map(([name, qty]) => `${name} x${qty}`)
    .join("\n");
}

function parseBreakdown(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of (text || "").split("\n")) {
    const m = line.match(/^(.*) x(\d+)$/);
    if (!m) continue;
    map.set(m[1], (map.get(m[1]) || 0) + Number(m[2]));
  }
  return map;
}

// Lægger nye tilvalg oven i de eksisterende og summerer antal pr. vare.
export function mergeAddonBreakdowns(existing: string, addition: string): string {
  const map = parseBreakdown(existing);
  for (const [name, qty] of parseBreakdown(addition)) {
    map.set(name, (map.get(name) || 0) + qty);
  }
  return Array.from(map.entries())
    .map(([name, qty]) => `${name} x${qty}`)
    .join("\n");
}
