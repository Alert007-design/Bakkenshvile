// Menu til bordbestillingen — læses fra den eksisterende AddOns-tabel, så huset
// vedligeholder præcis samme varer som billetkøbets tilvalg, ét sted.
//
// Klienten kalder ALDRIG Airtable direkte: menuen læses serverside gennem den
// cachede wrapper, så mange samtidige gæster ikke overskrider Airtables
// 5 kald/sekund. Priser omregnes til hele øre her.

import {
  cachedListRecords,
  priceGroupName,
  TABLES,
  FIELDS,
  type AirtableRecord,
} from "@/lib/airtable";
import { kronerToOre } from "@/lib/money";

// Standard dansk moms hvis en vare ikke har en eksplicit sats sat.
export const DEFAULT_VAT_RATE = 25;

// Menuen ændres sjældent; 60 sek. cache er rigeligt og skåner Airtable.
const MENU_TTL_MS = 60000;

// Gruppernes rækkefølge på drikkekortet, matcher AddOns.Kategori-valgene.
// Ukendte grupper vises til sidst i alfabetisk orden.
export const GROUP_ORDER = [
  "Øl",
  "Sodavand og vand",
  "Drinks",
  "Spritz",
  "Alkoholfrie drinks",
  "Rødvin",
  "Hvidvin",
  "Rosévin",
  "Champagne og mousserende vin",
  "Varme drikke",
  "Spiritus",
  "Hele flasker spiritus",
  "Snacks",
];

export interface MenuItem {
  id: string; // Airtable record-id (menuItemId)
  productCode: string; // stabil kode; falder tilbage til id hvis tom
  name: string;
  description: string;
  group: string;
  /**
   * Salpris i øre — den fulde pris. Bestilling ved bordet/via QR sker altid til
   * fuld pris; onlinerabatten gælder kun forudbestilte drikkevarer sammen med
   * billetten (senest kl. 12.00 på forestillingsdagen) og håndteres dér.
   */
  unitPriceOre: number;
  vatRate: number;
  sort: number;
}

export interface MenuGroup {
  group: string;
  items: MenuItem[];
}

// En vare er en gyldig menuvare hvis den er aktiv, har et navn og en positiv
// pris. Inaktive varer udelades helt (kan hverken vises eller købes).
function toMenuItem(rec: AirtableRecord): MenuItem | null {
  const f = rec.fields;
  const active = Boolean(f[FIELDS.addOn.active]);
  if (!active) return null;

  const name = String(f[FIELDS.addOn.name] ?? "").trim();
  if (!name) return null;

  const priceKr = Number(f[FIELDS.addOn.price] ?? 0);
  if (!Number.isFinite(priceKr) || priceKr <= 0) return null;

  const rawVat = Number(f[FIELDS.addOn.vatRate]);
  const vatRate = Number.isFinite(rawVat) && rawVat >= 0 ? rawVat : DEFAULT_VAT_RATE;

  const productCode = String(f[FIELDS.addOn.productCode] ?? "").trim() || rec.id;
  const sortRaw = Number(f[FIELDS.addOn.sort]);
  const unitPriceOre = kronerToOre(priceKr);

  return {
    id: rec.id,
    productCode,
    name,
    description: String(f[FIELDS.addOn.description] ?? "").trim(),
    group: priceGroupName(f[FIELDS.addOn.category]) || "Andet",
    unitPriceOre,
    vatRate,
    sort: Number.isFinite(sortRaw) ? sortRaw : 0,
  };
}

/** Alle aktive menuvarer, sorteret efter Sortering og derefter navn. */
export async function getMenuItems(): Promise<MenuItem[]> {
  const records = await cachedListRecords(TABLES.addOns, MENU_TTL_MS);
  return records
    .map(toMenuItem)
    .filter((m): m is MenuItem => m !== null)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "da"));
}

function groupRank(group: string): number {
  const i = GROUP_ORDER.indexOf(group);
  return i === -1 ? GROUP_ORDER.length : i;
}

/** Menuvarer grupperet efter Kategori i den definerede visningsrækkefølge. */
export async function getMenuGroups(): Promise<MenuGroup[]> {
  const items = await getMenuItems();
  const byGroup = new Map<string, MenuItem[]>();
  for (const item of items) {
    if (!byGroup.has(item.group)) byGroup.set(item.group, []);
    byGroup.get(item.group)!.push(item);
  }
  return Array.from(byGroup.entries())
    .map(([group, items]) => ({ group, items }))
    .sort(
      (a, b) => groupRank(a.group) - groupRank(b.group) || a.group.localeCompare(b.group, "da")
    );
}

/**
 * Opslagskort over AKTIVE menuvarer (id → vare). Bruges af checkout til at
 * validere kurven serverside: en vare der ikke findes her (ukendt eller
 * inaktiv) kan ikke købes.
 */
export async function getMenuMap(): Promise<Map<string, MenuItem>> {
  const items = await getMenuItems();
  return new Map(items.map((m) => [m.id, m]));
}
