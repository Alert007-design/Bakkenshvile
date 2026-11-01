// De rigtige afhængigheder til lib/selskab.ts: Airtable, Viva, mail og
// databasen. Samlet ét sted, så ruterne og siderne bruger det samme.

import {
  cachedListRecords,
  createRecord,
  findRecords,
  getRecord,
  priceGroupName,
  updateRecord,
  TABLES,
  FIELDS,
  type AirtableRecord,
} from "@/lib/airtable";
import { danishToday, getShowDate } from "@/lib/events";
import { getDb } from "@/lib/db";
import { kategoriFraAirtable } from "@/lib/kapacitet";
import { getMenuItems } from "@/lib/menu";
import { onlineDiscountActive } from "@/lib/genbestil";
import { gyldigtOpslagsnummer } from "@/lib/bookingopslag";
import { sendMail } from "@/lib/resend";
import type { AddonDef, TicketTypeDef } from "@/lib/ticket-checkout";

export async function hentBilletTyper(): Promise<TicketTypeDef[]> {
  const records = await cachedListRecords(TABLES.ticketTypes, 60_000);
  return records.map(
    (r): TicketTypeDef => ({
      id: r.id,
      category: String(r.fields[FIELDS.ticketType.category] ?? ""),
      price: Number(r.fields[FIELDS.ticketType.price] ?? 0),
      fee: Number(r.fields[FIELDS.ticketType.fee] ?? 0),
      maxCount: Number(r.fields[FIELDS.ticketType.maxCount] ?? 0),
      priceGroup: priceGroupName(r.fields[FIELDS.ticketType.priceGroup]),
      kapacitetskategori: kategoriFraAirtable(r.fields[FIELDS.ticketType.kapacitetskategori]),
    })
  );
}

/** Aktive drikkevarer fra AddOns (samme liste som drikkekortet). */
export async function hentTilvalg(): Promise<AddonDef[]> {
  const varer = await getMenuItems();
  return varer.map((v) => ({ id: v.id, name: v.name, price: v.unitPriceOre / 100 }));
}

export async function findBooking(bookingNo: string): Promise<AirtableRecord | null> {
  const nr = gyldigtOpslagsnummer(bookingNo);
  if (!nr) return null;
  const fundne = await findRecords(TABLES.bookings, `{Bookingnr}="${nr}"`);
  return fundne[0] ?? null;
}

export async function hentBooking(id: string): Promise<AirtableRecord | null> {
  try {
    return await getRecord(TABLES.bookings, id);
  } catch {
    return null;
  }
}

export const faelles = {
  get db() {
    return getDb();
  },
  hentShow: getShowDate,
  hentBilletTyper,
  hentTilvalg,
  findBooking,
  hentBooking,
  rabatAktiv: (dato: string) => onlineDiscountActive(dato),
  idag: () => danishToday(),
  opretKunde: (fields: Record<string, unknown>) => createRecord(TABLES.customers, fields),
  // typecast: statussen "Reserveret – afventer betaling" oprettes i Airtable
  // første gang, den bruges.
  opretBooking: (fields: Record<string, unknown>) =>
    createRecord(TABLES.bookings, fields, { typecast: true }),
  opdaterBooking: async (id: string, fields: Record<string, unknown>) => {
    await updateRecord(TABLES.bookings, id, fields);
  },
  sendMail: async (m: { to: string; subject: string; html: string }) => {
    await sendMail(m);
  },
};
