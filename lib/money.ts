// Al pengehåndtering i bordbestillingen sker i HELE ØRE (heltal). Flydende
// kommatal må aldrig være betalingsgrundlag. Menuens priser i Airtable står i
// kroner (currency-felt) og omregnes til øre her, ét sted.
//
// Moms er inkluderet i den viste pris (dansk norm). For en bruttopris på
// totalOre med momssats r% er momsandelen totalOre * r / (100 + r). Subtotal
// (ekskl. moms) er brutto minus moms.

export interface PriceLineInput {
  unitPriceOre: number; // enhedspris i øre (brutto, inkl. moms)
  quantity: number;
  vatRate: number; // momssats i procent, fx 25
}

export interface OrderTotals {
  subtotalOre: number; // ekskl. moms
  vatOre: number;
  totalOre: number; // brutto (det gæsten betaler)
}

/**
 * Omregner et kronebeløb (fra Airtable currency-felt) til hele øre. Runder til
 * nærmeste øre. Kaster på ikke-endelige tal, så et ugyldigt prisfelt aldrig
 * bliver til et betalingsbeløb.
 */
export function kronerToOre(kr: number): number {
  if (!Number.isFinite(kr)) throw new Error(`Ugyldig pris: ${kr}`);
  return Math.round(kr * 100);
}

/** Formaterer øre som "129,50 kr." til visning. */
export function formatOre(ore: number): string {
  const kr = (ore / 100).toFixed(2).replace(".", ",");
  return `${kr} kr.`;
}

/** Momsandelen af en bruttopris i øre (moms inkluderet i prisen). */
export function vatFromGrossOre(grossOre: number, vatRate: number): number {
  if (!Number.isFinite(vatRate) || vatRate < 0) {
    throw new Error(`Ugyldig momssats: ${vatRate}`);
  }
  return Math.round((grossOre * vatRate) / (100 + vatRate));
}

/** Linjetotal i øre = enhedspris × antal. */
export function lineTotalOre(unitPriceOre: number, quantity: number): number {
  if (!Number.isInteger(unitPriceOre) || !Number.isInteger(quantity)) {
    throw new Error("unitPriceOre og quantity skal være heltal");
  }
  if (quantity < 0) throw new Error("Antal kan ikke være negativt");
  return unitPriceOre * quantity;
}

/**
 * Beregner ordrens totaler i øre. Moms beregnes pr. linje (så den matcher
 * linjens snapshot) og summeres — subtotal er total minus moms.
 */
export function computeOrderTotals(lines: PriceLineInput[]): OrderTotals {
  let totalOre = 0;
  let vatOre = 0;
  for (const line of lines) {
    const gross = lineTotalOre(line.unitPriceOre, line.quantity);
    totalOre += gross;
    vatOre += vatFromGrossOre(gross, line.vatRate);
  }
  return { subtotalOre: totalOre - vatOre, vatOre, totalOre };
}
