// Simpelt wrapper-lag omkring Airtable REST API.
// Bruger native fetch — ingen ekstra npm-pakke nødvendig.

const BASE_URL = "https://api.airtable.com/v0";

// Table- og field-ID'er fra den oprettede "Bakkens Hvile"-base.
export const TABLES = {
  events: "tblxESwUnO7mpDxc2",
  ticketTypes: "tbl8HtjJeE2lDFwe7",
  addOns: "tbliFbDuQ7xWYTtpY",
  customers: "tblyxlJyn1J594ZEp",
  bookings: "tbl2pAlbe6LXuB1u9",
} as const;

export const FIELDS = {
  event: {
    title: "fld9jcRFTaRptnfLI",
    date: "fldmcnCM2SFCDWGKB",
    time: "fldcyiXJcx6kRV0N2",
    duration: "fldvWxZwE1yru1MHW",
    notes: "fldztH9TYEEqda6Zm",
    seatingLink: "fldfK75vTcpcpZx9d",
    priceGroup: "fldXSAvVkLrg5HZk0",
    soldOut: "fld3Cwq5W7lP8xaHE",
    bookings: "fldCRUAQ0zuJxyWq9",
  },
  ticketType: {
    category: "fldjmx1vfbTgxlDn0",
    price: "fldUQH5EMjpP5KhPJ",
    fee: "fldK1NBmdZyCTc0kL",
    maxCount: "fldg5GPUE2qt1HCsA",
    priceGroup: "fldz66mBlNz4Q2FcQ",
  },
  addOn: {
    name: "fldfRo2vS99rldTUD",
    price: "fldT7yU2cBiZ3TvBz",
    category: "fldR4bGu31Z1OmXqd",
    // Felter tilføjet til bordbestillingen (samme liste som billetkøbets
    // tilvalg — huset vedligeholder menuen ét sted).
    description: "fld9SPCNuanJLJJtM",
    active: "fldzBVlQpYB030TD5",
    vatRate: "fldyTzzoKdHYFxRrV",
    productCode: "fldRykFDSu0Y3CK1Q",
    sort: "fldiVSQNs8MQ5EaA1",
  },
  customer: {
    name: "fldJj0hE2qNJIN136",
    company: "fldYGfTjB6CBHia6M",
    address: "fld4nTPUii8qqHuad",
    zip: "fld56cqNPbtjDOGGH",
    phone: "fldZ7O9UcOLff1r8m",
    email: "fldTMMYOx0URW3fNm",
  },
  booking: {
    bookingNo: "fldnA26oRG6pJ2wID",
    specialRequests: "fldgcLmZykvBDiqNY",
    ticketCount: "fldtZDE5TUgS7WytY",
    status: "fldrSmSBnsy3Pn97U",
    show: "fldhjxSvlSb4FPnoX",
    customer: "fld6mNs8WHbY3hx08",
    tableNumber: "fld8HeJeRz5yJhuvL",
    wantsMatching: "fld242N7bp3xLt6Jc",
    ageGroup: "fldcCOEcmEN8HOgNY",
    location: "fldki1v83drDTvxWy",
    interests: "fldqeD4BMprejPZrC",
    drinkPreference: "fldTUUh4pZHpvakeb",
    matchNote: "fldiOj5VZFyDT4Wlo",
    discount: "fldyvk9ctBK7yyYrn",
    ticketBreakdown: "fldXuocW3IneLzwnY",
    key: "fldxkPBhklx1pv3ng",
    addons: "fldmL8WJLs0OHLPd3",
    totalPaid: "fldfamJJegkmOLm1q",
    varselSent: "fldOjgNoFV98SFA5m",
  },
} as const;

// Normaliserer en Prisgruppe-værdi til en ren streng.
// Events' Prisgruppe er singleSelect og leveres som objekt ({ id, name, color }),
// mens TicketTypes' Prisgruppe er singleLineText og leveres som ren streng.
// Denne funktion tåler begge former — også hvis TicketTypes-feltet senere
// konverteres til singleSelect — så de to felter altid kan sammenlignes.
export function priceGroupName(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") return name.trim();
  }
  return String(value).trim();
}

function headers() {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN mangler i miljøvariablerne");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function baseId() {
  const id = process.env.AIRTABLE_BASE_ID;
  if (!id) throw new Error("AIRTABLE_BASE_ID mangler i miljøvariablerne");
  return id;
}

// --- Resiliens: backoff, 429-håndtering og caching ---------------------------
//
// Airtable tillader kun 5 kald/sekund pr. base. Med mange samtidige gæster og
// barens løbende polling skal vi derfor: (1) aldrig lade klienter kalde Airtable
// direkte, (2) cache serverside, og (3) tåle 429/5xx med eksponentiel backoff.

export type AirtableRecord = { id: string; fields: Record<string, unknown> };

const MAX_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Deterministisk-nok jitter uden Math.random, så to samtidige kald ikke rammer
// præcis samme backoff-vindue.
let jitterSeed = 0;
function jitter(): number {
  jitterSeed = (jitterSeed + 137) % 500;
  return jitterSeed;
}

// Fetch mod Airtable med eksponentiel backoff på 429 og 5xx. Respekterer
// Retry-After-headeren når den findes. Returnerer det sidste svar (også hvis
// det stadig fejler efter alle forsøg), så kalderen selv kan håndtere status.
export async function airtableFetch(
  url: string,
  init: RequestInit,
  opts: { retries?: number; baseDelayMs?: number } = {}
): Promise<Response> {
  const retries = opts.retries ?? MAX_RETRIES;
  const baseDelay = opts.baseDelayMs ?? 500;
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt >= retries) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(baseDelay * 2 ** attempt, 8000) + jitter();
    await sleep(delay);
    attempt++;
  }
}

// Serverside in-memory cache med TTL og "stale-on-error": hvis Airtable fejler,
// returneres sidst kendte gode data i stedet for at vælte baren.
type CacheEntry = { data: AirtableRecord[]; at: number };
const listCache = new Map<string, CacheEntry>();

/**
 * Som listRecords, men cachet i ttlMs og med stale-on-error. Bruges af alt der
 * polles ofte (menu, barens ordrer via spejling), så Airtables 5 kald/sekund
 * aldrig overskrides. now() injiceres til test.
 */
export async function cachedListRecords(
  tableId: string,
  ttlMs = 30000,
  now: () => number = Date.now
): Promise<AirtableRecord[]> {
  const t = now();
  const hit = listCache.get(tableId);
  if (hit && t - hit.at < ttlMs) return hit.data;
  try {
    const data = await listRecords(tableId);
    listCache.set(tableId, { data, at: t });
    return data;
  } catch (err) {
    if (hit) return hit.data; // stale-on-error
    throw err;
  }
}

/** Rydder list-cachen (kun til test og manuel invalidering). */
export function clearAirtableCache(tableId?: string) {
  if (tableId) listCache.delete(tableId);
  else listCache.clear();
}

// Batchede skrivninger — Airtable tillader max 10 records pr. kald.
async function writeInChunks(
  tableId: string,
  method: "POST" | "PATCH",
  records: Array<Record<string, unknown> | { id: string; fields: Record<string, unknown> }>
): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10).map((r) =>
      "id" in r ? { id: r.id, fields: r.fields } : { fields: r }
    );
    const res = await airtableFetch(
      `${BASE_URL}/${baseId()}/${tableId}?returnFieldsByFieldId=true`,
      {
        method,
        headers: headers(),
        body: JSON.stringify({ records: chunk }),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable-fejl ved batch-${method} (${tableId}): ${body}`);
    }
    const data = await res.json();
    out.push(...(data.records as AirtableRecord[]));
  }
  return out;
}

/** Opretter mange records i batches af 10. */
export function createRecords(
  tableId: string,
  records: Array<Record<string, unknown>>
): Promise<AirtableRecord[]> {
  return writeInChunks(tableId, "POST", records);
}

/** Opdaterer mange records i batches af 10. */
export function updateRecords(
  tableId: string,
  records: Array<{ id: string; fields: Record<string, unknown> }>
): Promise<AirtableRecord[]> {
  return writeInChunks(tableId, "PATCH", records);
}

export async function listRecords(tableId: string) {
  const res = await airtableFetch(
    `${BASE_URL}/${baseId()}/${tableId}?returnFieldsByFieldId=true`,
    {
      headers: headers(),
      next: { revalidate: 30 },
    } as RequestInit
  );
  if (!res.ok) throw new Error(`Airtable-fejl (${tableId}): ${res.status}`);
  const data = await res.json();
  return data.records as AirtableRecord[];
}

export async function findRecords(tableId: string, filterByFormula: string) {
  const res = await airtableFetch(
    `${BASE_URL}/${baseId()}/${tableId}?returnFieldsByFieldId=true&filterByFormula=${encodeURIComponent(
      filterByFormula
    )}`,
    {
      headers: headers(),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`Airtable-fejl (${tableId}): ${res.status}`);
  const data = await res.json();
  return data.records as AirtableRecord[];
}

export async function getRecord(tableId: string, recordId: string) {
  const res = await airtableFetch(
    `${BASE_URL}/${baseId()}/${tableId}/${recordId}?returnFieldsByFieldId=true`,
    {
      headers: headers(),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`Airtable-fejl (${tableId}/${recordId}): ${res.status}`);
  return res.json() as Promise<AirtableRecord>;
}

export async function createRecord(
  tableId: string,
  fields: Record<string, unknown>
) {
  const res = await airtableFetch(
    `${BASE_URL}/${baseId()}/${tableId}?returnFieldsByFieldId=true`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable-fejl ved oprettelse (${tableId}): ${body}`);
  }
  return res.json();
}

export async function updateRecord(
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>
) {
  const res = await airtableFetch(
    `${BASE_URL}/${baseId()}/${tableId}/${recordId}?returnFieldsByFieldId=true`,
    {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable-fejl ved opdatering (${tableId}): ${body}`);
  }
  return res.json();
}
