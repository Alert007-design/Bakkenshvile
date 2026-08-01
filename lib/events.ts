// Ét sted til forestillinger (Events) fra Airtable.
//
// Før denne fil mappede /book, /admin, /api/bar/hall-state og /api/cron/varsel
// hver for sig de samme felter. Med flere samtidige events skal reglerne for
// "hvilke datoer er relevante" og "hvilken prisgruppe hører til datoen" ligge
// ét sted, så billetkøb, bordplan og barskærm aldrig kan komme til at være
// uenige om det samme show.

import {
  cachedListRecords,
  getRecord,
  TABLES,
  FIELDS,
  priceGroupName,
  type AirtableRecord,
} from "@/lib/airtable";

export type ShowDate = {
  id: string;
  title: string;
  /** ISO-dato, YYYY-MM-DD. */
  date: string;
  /** "HH:MM". */
  time: string;
  duration: string;
  notes: string;
  /** Prisgruppen fra Events — afgør hvilke billettyper der gælder for datoen. */
  priceGroup: string;
  /** Udsolgte datoer vises stadig, men kan ikke bookes. */
  soldOut: boolean;
};

/** Mapper én Airtable-post til en ShowDate. Tåler manglende felter. */
export function toShowDate(record: AirtableRecord): ShowDate {
  const f = record.fields;
  return {
    id: record.id,
    title: String(f[FIELDS.event.title] ?? "Kommende show"),
    date: String(f[FIELDS.event.date] ?? ""),
    time: String(f[FIELDS.event.time] ?? ""),
    duration: String(f[FIELDS.event.duration] ?? ""),
    notes: String(f[FIELDS.event.notes] ?? ""),
    priceGroup: priceGroupName(f[FIELDS.event.priceGroup]),
    soldOut: Boolean(f[FIELDS.event.soldOut]),
  };
}

/**
 * Dagens dato i dansk tid som YYYY-MM-DD. Serveren kører i UTC på Vercel, så
 * datoen må aldrig udledes af den lokale servertid: sent på aftenen dansk tid
 * er det stadig samme kalenderdag i UTC, men omvendt ville et show sent på
 * dagen kunne forsvinde for tidligt ved en naiv sammenligning.
 */
export function danishToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Er datoen i dag eller senere (dansk tid)? Showdagen selv tæller med, så der
 * kan sælges billetter helt frem til aftenens forestilling. Ukendt/tom dato
 * regnes som ikke-kommende, så en fejlagtig post aldrig kan bookes.
 */
export function isUpcoming(date: string, today: string = danishToday()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return date >= today;
}

export type ListShowDatesOptions = {
  /** Tag afholdte datoer med (bruges af bordplan/arkiv). Default false. */
  includePast?: boolean;
  /** Cache-levetid mod Airtable i ms. Default 60 sekunder. */
  ttlMs?: number;
};

/**
 * Alle relevante forestillinger, sorteret kronologisk (ældste først).
 * Bruger den cachede Airtable-læsning, så mange samtidige gæster ikke rammer
 * Airtables grænse på 5 kald/sekund.
 */
export async function listShowDates(
  opts: ListShowDatesOptions = {}
): Promise<ShowDate[]> {
  const { includePast = false, ttlMs = 60_000 } = opts;
  const records = await cachedListRecords(TABLES.events, ttlMs);
  const today = danishToday();
  return records
    .map(toShowDate)
    .filter((s) => (includePast ? Boolean(s.date) : isUpcoming(s.date, today)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Én forestilling ud fra Airtable-id. Bruges serverside ved checkout, hvor
 * eventets egen prisgruppe og udsolgt-flag skal slås op — aldrig klientens.
 * Returnerer null hvis id'et ikke findes.
 */
export async function getShowDate(id: string): Promise<ShowDate | null> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return null;
  try {
    const record = await getRecord(TABLES.events, id);
    return toShowDate(record);
  } catch {
    return null;
  }
}

/**
 * Kan der købes billetter til denne forestilling lige nu? Samlet regel, så
 * både UI og checkout svarer ens: datoen skal være kommende, og showet må ikke
 * være udsolgt.
 */
export function isBookable(show: ShowDate, today: string = danishToday()): boolean {
  return isUpcoming(show.date, today) && !show.soldOut;
}
