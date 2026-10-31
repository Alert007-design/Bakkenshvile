// Prisoversigten på forsiden (#priser): billetprisen for hver af de fire
// priskategorier på hverdage (tirsdag-torsdag) og i weekenden
// (fredag-søndag).
//
// Én kilde: priserne læses fra billettyperne i Airtable, så tabellen altid
// viser det samme, som kunden betaler. Prisen er pris + gebyr, ligesom ved
// købet (lib/ticket-checkout.ts).

import { listRecords, TABLES, FIELDS, priceGroupName } from "@/lib/airtable";
import { kategoriFraAirtable, KAPACITETSKATEGORIER, type Kapacitetskategori } from "@/lib/kapacitet";

/** Prisgruppen i Airtable for tirsdag-torsdag. */
export const PRISGRUPPE_HVERDAG = "Hverdag";
/** Prisgruppen i Airtable for fredag-søndag. */
export const PRISGRUPPE_WEEKEND = "Ordinær";

/** Teksten i første kolonne — samme rækkeinddeling som salen. */
export const KATEGORI_TEKST: Record<Kapacitetskategori, string> = {
  aplusForrest: "A+ (1., 2. og 3. række)",
  aplusBagerst: "A+ (4., 5. og 6. række)",
  a: "A (7., 8. og 9. række)",
  b: "B (10. række)",
};

export interface Prisraekke {
  kategori: Kapacitetskategori;
  tekst: string;
  /** Pris i hele kroner inkl. gebyr. null = ingen billettype fundet. */
  hverdag: number | null;
  weekend: number | null;
}

export interface Billettype {
  priceGroup: string;
  kapacitetskategori: Kapacitetskategori | null;
  price: number;
  fee: number;
}

function tal(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Bygger tabellen ud fra billettyperne. Ren funktion, så den kan testes.
 * Findes en kategori ikke i en prisgruppe, står prisen som null og vises som
 * en streg — der gættes aldrig på en pris.
 */
export function byggPrisoversigt(typer: Billettype[]): Prisraekke[] {
  const find = (gruppe: string, kat: Kapacitetskategori): number | null => {
    const t = typer.find(
      (x) => x.priceGroup === gruppe && x.kapacitetskategori === kat
    );
    return t ? t.price + t.fee : null;
  };
  return KAPACITETSKATEGORIER.map((kat) => ({
    kategori: kat,
    tekst: KATEGORI_TEKST[kat],
    hverdag: find(PRISGRUPPE_HVERDAG, kat),
    weekend: find(PRISGRUPPE_WEEKEND, kat),
  }));
}

/** Henter billettyperne fra Airtable og bygger tabellen. */
export async function hentPrisoversigt(): Promise<Prisraekke[]> {
  const poster = await listRecords(TABLES.ticketTypes);
  const typer: Billettype[] = poster.map((r) => ({
    priceGroup: priceGroupName(r.fields[FIELDS.ticketType.priceGroup]),
    kapacitetskategori: kategoriFraAirtable(
      r.fields[FIELDS.ticketType.kapacitetskategori]
    ),
    price: tal(r.fields[FIELDS.ticketType.price]),
    fee: tal(r.fields[FIELDS.ticketType.fee]),
  }));
  return byggPrisoversigt(typer);
}
