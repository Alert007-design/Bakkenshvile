// Kapacitet pr. priskategori: hvor mange billetter der findes, og hvor mange
// der er tilbage. Ren regnefil — ingen database, ingen Airtable-kald, ingen
// tid. Alt sendes ind, så reglerne kan efterprøves i en test.
//
// Salen sælges i FIRE priskategorier (A+ er to). Tallene nedenfor er husets
// beslutning om, hvor mange billetter der sættes til salg — de er bevidst IKKE
// udledt af bordplanen i lib/tables.ts (44 borde × 4 personer), for man sælger
// ikke nødvendigvis hver eneste stol ved hvert bord.

/** De fire priskategorier, billetter sælges i. */
export type Kapacitetskategori =
  | "aplusForrest"
  | "aplusBagerst"
  | "a"
  | "b";

/** Kategorierne i den rækkefølge, salen læses forfra og bagud. */
export const KAPACITETSKATEGORIER: Kapacitetskategori[] = [
  "aplusForrest",
  "aplusBagerst",
  "a",
  "b",
];

/** Standardkapacitet pr. forestilling. I alt 172 billetter. */
export const STANDARD_KAPACITET: Record<Kapacitetskategori, number> = {
  aplusForrest: 58,
  aplusBagerst: 60,
  a: 42,
  b: 12,
};

/** Læsbare navne til admin og til fejlbeskeder. */
export const KATEGORI_NAVN: Record<Kapacitetskategori, string> = {
  aplusForrest: "A+ forrest (1.-3. række)",
  aplusBagerst: "A+ bagerst (4.-6. række)",
  a: "A (7.-9. række)",
  b: "B (10. række)",
};

/**
 * Valgmulighederne i Airtable-feltet "Kapacitetskategori" på billettyperne,
 * oversat til vores nøgler. Stavemåden skal matche Airtable præcist.
 */
const AIRTABLE_VALG: Record<string, Kapacitetskategori> = {
  "A+ forrest": "aplusForrest",
  "A+ bagerst": "aplusBagerst",
  A: "a",
  B: "b",
};

/**
 * Oversætter Airtable-feltet til en kapacitetskategori.
 *
 * Returnerer null ved tomt eller ukendt felt. Kalderen SKAL behandle null som
 * "kan ikke sælges" — så kan en billettype, hvor feltet er glemt, aldrig føre
 * til oversalg, fordi den ikke tælles med nogen steder.
 */
export function kategoriFraAirtable(value: unknown): Kapacitetskategori | null {
  let navn: string | null = null;
  if (typeof value === "string") navn = value;
  else if (value && typeof value === "object") {
    const n = (value as { name?: unknown }).name;
    if (typeof n === "string") navn = n;
  }
  if (navn == null) return null;
  return AIRTABLE_VALG[navn.trim()] ?? null;
}

/** Ejerens justering pr. kategori. Tomt felt = brug standardtallet. */
export type Kapacitetsjustering = Partial<
  Record<Kapacitetskategori, number | null | undefined>
>;

/**
 * Et gyldigt kapacitetstal er et helt tal på nul eller derover. 0 er en rigtig
 * justering ("sælg ingen billetter i denne kategori"), mens tomt, negativt og
 * kommatal falder tilbage på standardtallet.
 */
function gyldigtTal(v: unknown): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isInteger(v) || v < 0) return null;
  return v;
}

/** Kapaciteten for en forestilling: justeringen hvis den findes, ellers standard. */
export function kapaciteterFor(
  justering: Kapacitetsjustering
): Record<Kapacitetskategori, number> {
  const ud = { ...STANDARD_KAPACITET };
  for (const k of KAPACITETSKATEGORIER) {
    const tal = gyldigtTal(justering[k]);
    if (tal !== null) ud[k] = tal;
  }
  return ud;
}

/**
 * Hvor mange billetter er der tilbage? Aldrig under nul — sænkes kapaciteten
 * under det allerede solgte, er svaret 0 ("Udsolgt"), og de solgte billetter
 * røres ikke.
 */
export function tilbageEfterSalg(kapacitet: number, taget: number): number {
  return Math.max(0, kapacitet - taget);
}

/** Tallene for én kategori, som de vises på /book og i admin. */
export interface Kategoritilstand {
  kapacitet: number;
  /** Reserveret + solgt lige nu. */
  taget: number;
  tilbage: number;
}

export type Kapacitetsoversigt = Record<Kapacitetskategori, Kategoritilstand>;

/**
 * Samler tallene for alle fire kategorier.
 *
 * Det manuelle udsolgt-flueben på forestillingen i Airtable har ALTID forrang:
 * er det sat, er der nul tilbage overalt, uanset hvad tallene siger.
 */
export function byggOversigt(params: {
  kapaciteter: Record<Kapacitetskategori, number>;
  tagne: Record<Kapacitetskategori, number>;
  manueltUdsolgt: boolean;
}): Kapacitetsoversigt {
  const { kapaciteter, tagne, manueltUdsolgt } = params;
  const ud = {} as Kapacitetsoversigt;
  for (const k of KAPACITETSKATEGORIER) {
    const kapacitet = kapaciteter[k];
    const taget = tagne[k];
    ud[k] = {
      kapacitet,
      taget,
      tilbage: manueltUdsolgt ? 0 : tilbageEfterSalg(kapacitet, taget),
    };
  }
  return ud;
}
