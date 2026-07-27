// Eneste kilde til salens borde i Bakkens Hvile.
//
// Billetsystemet, bordplanen, QR-generatoren og bordbestillingen skal ALLE
// bruge denne fil — der må kun være én borddefinition i kodebasen.
//
// Nummerering: første ciffer (eller "10" for 101/102) angiver rækken, sidste
// ciffer angiver placeringen i rækken talt FRA BAREN og indad. Bord 63 er
// altså 6. række, 3. bord fra baren. Baren ligger langs salens højre side.
//
// Kategorier følger salplanen (SeatingChart i BookingClient.tsx):
//   Række 1-6:  A+
//   Række 7-9:  A   — dog er bord 94 (venstre bord i 9. række) kategori B
//   Række 10:   B
//
// VIGTIGT: bordets eksistens afgøres af den eksplicitte allowlist nedenfor —
// aldrig af en matematisk beregning alene. row()/position() må kun bruges til
// visning og rutesortering, ikke til at afgøre om et bord findes.

export type TableCategory = "A+" | "A" | "B";

export interface TableDef {
  /** Bordnummer, fx 63. */
  number: number;
  /** Række 1-10. */
  row: number;
  /** Placering i rækken, 1 = nærmest baren. */
  position: number;
  /** Priskategori. */
  category: TableCategory;
}

// Antal borde pr. række, i rækkefølge fra række 1 til række 10.
// Summen er præcis 44 (bevogtet af en test).
const ROW_SIZES: readonly number[] = [5, 5, 5, 5, 5, 5, 4, 4, 4, 2];

// Bord 94 er kategori B ("det venstre bord i 9. række"). Bekræftet mod
// salplanen. Alle andre A-rækkeborde (7-9) er kategori A.
const B_TABLES_IN_A_ROWS = new Set<number>([94]);

function categoryFor(row: number, number: number): TableCategory {
  if (row <= 6) return "A+";
  if (row === 10) return "B";
  // Række 7-9: som udgangspunkt A, med de eksplicitte B-undtagelser.
  return B_TABLES_IN_A_ROWS.has(number) ? "B" : "A";
}

// Bygger det kanoniske bordnummer for (række, placering). Række 1-9 bruger
// række*10 + placering; række 10 bruger 100 + placering (101, 102).
// Eksporteret, så salplanen (SeatingChart) kan udlede hvert bords nummer og
// kategori herfra i stedet for at have sin egen definition.
export function tableNumberFor(row: number, position: number): number {
  return row === 10 ? 100 + position : row * 10 + position;
}

// Den fulde, kanoniske liste over alle 44 borde. Genereres deterministisk ud
// fra ROW_SIZES, men listen af GYLDIGE numre nedenfor (VALID_TABLE_NUMBERS) er
// den, der afgør eksistens.
export const TABLES: readonly TableDef[] = ROW_SIZES.flatMap((size, i) => {
  const row = i + 1;
  return Array.from({ length: size }, (_, p) => {
    const position = p + 1;
    const number = tableNumberFor(row, position);
    return { number, row, position, category: categoryFor(row, number) };
  });
});

// Eksplicit allowlist over alle 44 gyldige bordnumre. Dette er den autoritative
// kilde til, om et bord findes. Skrevet ud fuldt, så den kan læses og
// verificeres direkte mod skiltene i salen.
export const VALID_TABLE_NUMBERS: readonly number[] = [
  11, 12, 13, 14, 15,
  21, 22, 23, 24, 25,
  31, 32, 33, 34, 35,
  41, 42, 43, 44, 45,
  51, 52, 53, 54, 55,
  61, 62, 63, 64, 65,
  71, 72, 73, 74,
  81, 82, 83, 84,
  91, 92, 93, 94,
  101, 102,
];

const VALID_SET: ReadonlySet<number> = new Set(VALID_TABLE_NUMBERS);

const TABLE_BY_NUMBER: ReadonlyMap<number, TableDef> = new Map(
  TABLES.map((t) => [t.number, t])
);

/** Sand hvis nummeret er ét af de 44 gyldige borde (allowlist-opslag). */
export function isValidTableNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && VALID_SET.has(n);
}

/**
 * Parser og validerer et bordnummer fra en streng (fx en URL-parameter).
 * Returnerer bordets definition, eller null hvis det ikke er et gyldigt bord.
 * Afviser førende nuller, mellemrum og alt uden for allowlisten.
 */
export function parseTableNumber(raw: unknown): TableDef | null {
  if (typeof raw === "number") {
    return isValidTableNumber(raw) ? TABLE_BY_NUMBER.get(raw)! : null;
  }
  if (typeof raw !== "string") return null;
  // Kun rene cifre, ingen førende nul, ingen tegn/whitespace.
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const n = Number(raw);
  return isValidTableNumber(n) ? TABLE_BY_NUMBER.get(n)! : null;
}

/** Slår et bord op på nummer. Null hvis bordet ikke findes. */
export function getTable(n: number): TableDef | null {
  return TABLE_BY_NUMBER.get(n) ?? null;
}

// --- Display-helpers (kun til visning/sortering, ikke til eksistenstjek) ---

/** Rækken et bordnummer tilhører. Gælder kun for gyldige numre. */
export function row(number: number): number {
  return number >= 100 ? 10 : Math.floor(number / 10);
}

/** Placeringen i rækken (1 = nærmest baren). Gælder kun for gyldige numre. */
export function position(number: number): number {
  return number >= 100 ? number - 100 : number % 10;
}

/**
 * Rutesortering til baren: række først, derefter placering (nærmest baren
 * først), så tjeneren kan gå den korteste vej med varerne.
 */
export function byRoute(a: number, b: number): number {
  return row(a) - row(b) || position(a) - position(b);
}

export const TABLE_COUNT = VALID_TABLE_NUMBERS.length;
