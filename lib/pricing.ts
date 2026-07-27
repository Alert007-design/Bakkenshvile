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

// Rabatbeløbet i hele kroner, beregnet på det samlede tilvalgs-beløb.
// Rundes ned (Math.floor), så rabatten aldrig overstiger 10%.
export function addonDiscountKr(addonSubtotalKr: number): number {
  if (!Number.isFinite(addonSubtotalKr) || addonSubtotalKr <= 0) return 0;
  return Math.floor(addonSubtotalKr * ADDON_DISCOUNT_RATE);
}

// Rabatteret enhedspris til visning pr. tilvalg. Kun til visning — den
// bindende rabat beregnes på summen via addonDiscountKr(), så en enkelt linje
// kan afvige nogle øre fra den summerede rabat. Rundes ned for at følge samme
// princip som totalrabatten.
export function discountedAddonUnitKr(unitKr: number): number {
  return Math.floor(unitKr * (1 - ADDON_DISCOUNT_RATE));
}
