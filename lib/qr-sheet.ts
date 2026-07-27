// Ren datamodel for QR-arkene — adskilt fra selve rendringen, så den kan
// testes uden en QR-billedafhængighed. scripts/generate-qr-sheet.ts bygger
// oven på dette og tegner de faktiske QR-koder.

import { VALID_TABLE_NUMBERS, getTable, type TableCategory } from "@/lib/tables";
import { tableUrl, TABLE_TOKEN_VERSION } from "@/lib/table-tokens";

export interface QrSheetEntry {
  number: number;
  row: number;
  position: number;
  category: TableCategory;
  version: string;
  url: string;
}

/**
 * Bygger data for alle 44 QR-ark: ét pr. gyldigt bord, i rutesorteret
 * rækkefølge (række, så placering). URL'en indeholder bordets versionsbundne
 * token. Kaster hvis TABLE_QR_SECRET mangler.
 */
export function buildQrSheet(
  baseUrl: string,
  version: string = TABLE_TOKEN_VERSION
): QrSheetEntry[] {
  return VALID_TABLE_NUMBERS.map((number) => {
    const t = getTable(number)!;
    return {
      number,
      row: t.row,
      position: t.position,
      category: t.category,
      version,
      url: tableUrl(number, baseUrl, version),
    };
  });
}
