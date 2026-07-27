// Delt prisberegning for booking-flowet.
//
// Onlinerabat: 10% på tilvalg (drikkevarer). Rabatten gælder KUN tilvalg —
// aldrig billetpriser og aldrig gebyret. Den beregnes på summen af alle
// tilvalg (ikke pr. linje) og rundes ned til nærmeste hele krone.
//
// Både frontend (visning) og Stripe-checkout (det trukne beløb) bruger disse
// funktioner, så det gæsten ser og det der trækkes altid er præcis samme tal.

export const ADDON_DISCOUNT_RATE = 0.1;

export const ADDON_DISCOUNT_LABEL = "Onlinerabat, 10% på drikkevarer";

// Rabat pr. enhed i hele kroner, rundet ned (Math.floor). Dette er den
// bindende enhed: både den viste pris pr. linje og det trukne beløb bygger på
// dette tal, så det gæsten ser pr. linje altid er identisk med det trukne.
export function addonUnitDiscountKr(unitKr: number): number {
  if (!Number.isFinite(unitKr) || unitKr <= 0) return 0;
  return Math.floor(unitKr * ADDON_DISCOUNT_RATE);
}

// Rabatteret enhedspris til visning: fuld pris minus den enhedsfloorede rabat.
export function discountedAddonUnitKr(unitKr: number): number {
  return unitKr - addonUnitDiscountKr(unitKr);
}

// Samlet rabat = summen af de enhedsfloorede rabatter (× antal) — IKKE en
// separat floor på totalen. Dermed summerer linjerne præcis til totalen, og
// det viste stemmer nøjagtigt med det trukne. Deles af frontend og checkout.
export function addonsTotalDiscountKr(
  lines: { unitKr: number; quantity: number }[]
): number {
  return lines.reduce(
    (sum, line) => sum + addonUnitDiscountKr(line.unitKr) * line.quantity,
    0
  );
}
