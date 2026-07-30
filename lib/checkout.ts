// Ren servervalidering af en bordbestilling. Browseren sender KUN
// menuItemId+quantity (plus bord, token, event, navn, besked, fase) — aldrig
// pris, navn, moms eller beløb. Alle beløb genberegnes her ud fra menuen, så
// manipulation i browseren er uden virkning.
//
// Denne funktion er ren (ingen IO): kalderen henter token-gyldighed,
// bestillingsåbning og menuen og sender dem ind. Det gør valideringen fuldt
// testbar.

import type { MenuItem } from "@/lib/menu";
import type { DraftOrderInput, DraftOrderLine } from "@/lib/orders";
import { computeOrderTotals, lineTotalOre, vatFromGrossOre } from "@/lib/money";
import {
  MAX_GUEST_NAME_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_ORDER_TOTAL_ORE,
  MAX_PER_ITEM,
  MAX_TOTAL_ITEMS,
} from "@/lib/table-ordering-config";
import type { TableDef } from "@/lib/tables";

export interface CheckoutContext {
  table: TableDef | null; // resultat af allowlist-opslag
  tokenValid: boolean;
  orderingOpen: boolean;
  eventId: string;
  menu: Map<string, MenuItem>; // KUN aktive varer
}

export interface StripeLineInput {
  name: string;
  unitAmountOre: number;
  quantity: number;
}

export type CheckoutResult =
  | { ok: false; status: number; error: string }
  | { ok: true; draft: DraftOrderInput; stripeLines: StripeLineInput[] };

const GENERIC_TOKEN_ERROR = "Scan koden på bordet igen.";

function asItems(raw: unknown): { menuItemId: string; quantity: number }[] | null {
  if (!Array.isArray(raw)) return null;
  const items: { menuItemId: string; quantity: number }[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") return null;
    const menuItemId = (it as { menuItemId?: unknown }).menuItemId;
    const quantity = (it as { quantity?: unknown }).quantity;
    if (typeof menuItemId !== "string" || !menuItemId) return null;
    if (typeof quantity !== "number" || !Number.isInteger(quantity)) return null;
    items.push({ menuItemId, quantity });
  }
  return items;
}

export function validateCheckout(body: unknown, ctx: CheckoutContext): CheckoutResult {
  const b = (body ?? {}) as Record<string, unknown>;

  // 1) Bord skal findes (allowlist) og token skal passe til netop det bord.
  if (!ctx.table) return { ok: false, status: 400, error: GENERIC_TOKEN_ERROR };
  if (!ctx.tokenValid) return { ok: false, status: 401, error: GENERIC_TOKEN_ERROR };

  // 2) Bestilling skal være åben for det aktive event.
  if (!ctx.orderingOpen) {
    return {
      ok: false,
      status: 403,
      error: "Bestilling er ikke åben lige nu.",
    };
  }

  // 3) Navn (påkrævet, rimelig længde).
  const guestName = typeof b.guestName === "string" ? b.guestName.trim() : "";
  if (!guestName) {
    return { ok: false, status: 400, error: "Skriv et navn, så vi ved hvem bestillingen er til." };
  }
  if (guestName.length > MAX_GUEST_NAME_LENGTH) {
    return { ok: false, status: 400, error: "Navnet er for langt." };
  }

  // 4) Valgfri besked.
  const message =
    typeof b.message === "string" && b.message.trim() ? b.message.trim() : undefined;
  if (message && message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, status: 400, error: "Beskeden er for lang." };
  }

  // 5) Leveringsfase.
  const phase = b.requestedDeliveryPhase;
  if (phase !== "now" && phase !== "interval") {
    return { ok: false, status: 400, error: "Ugyldigt leveringsvalg." };
  }

  // 6) Varelinjer.
  const items = asItems(b.items);
  if (!items || items.length === 0) {
    return { ok: false, status: 400, error: "Vælg mindst én vare." };
  }

  // Læg antal sammen pr. vare (dobbelte linjer for samme vare tillades).
  const qtyById = new Map<string, number>();
  for (const it of items) {
    qtyById.set(it.menuItemId, (qtyById.get(it.menuItemId) ?? 0) + it.quantity);
  }

  const lines: DraftOrderLine[] = [];
  const stripeLines: StripeLineInput[] = [];
  let totalItems = 0;

  for (const [menuItemId, quantity] of qtyById) {
    if (quantity <= 0) {
      return { ok: false, status: 400, error: "Ugyldigt antal." };
    }
    if (quantity > MAX_PER_ITEM) {
      return { ok: false, status: 400, error: `Højst ${MAX_PER_ITEM} af samme vare.` };
    }
    // Varen SKAL findes i den aktive menu — ellers (ukendt/inaktiv) afvises.
    const item = ctx.menu.get(menuItemId);
    if (!item) {
      return { ok: false, status: 409, error: "En vare er ikke længere tilgængelig." };
    }
    totalItems += quantity;

    // QR-/bordbestilling sker ALTID til fuld pris. Onlinerabatten på 10% gælder
    // udelukkende forudbestilling af drikkevarer sammen med billetten, og kun
    // indtil kl. 12.00 dansk tid på forestillingsdagen — aldrig ved bordet
    // eller via QR-koden. Linjesnapshot og Stripe-beløb bruger derfor menuens
    // fulde pris, så ordren summerer præcis til det trukne beløb.
    const unitOre = item.unitPriceOre;
    const lineTotal = lineTotalOre(unitOre, quantity);
    lines.push({
      menuItemId: item.id,
      productCode: item.productCode,
      name: item.name,
      quantity,
      unitPriceOre: unitOre,
      vatRate: item.vatRate,
      lineTotalOre: lineTotal,
    });
    stripeLines.push({
      name: item.name,
      unitAmountOre: unitOre,
      quantity,
    });
  }

  if (totalItems > MAX_TOTAL_ITEMS) {
    return { ok: false, status: 400, error: `Højst ${MAX_TOTAL_ITEMS} varer pr. bestilling.` };
  }

  const totals = computeOrderTotals(
    lines.map((l) => ({
      unitPriceOre: l.unitPriceOre,
      quantity: l.quantity,
      vatRate: l.vatRate,
    }))
  );

  if (totals.totalOre > MAX_ORDER_TOTAL_ORE) {
    return { ok: false, status: 400, error: "Bestillingen overstiger det tilladte beløb." };
  }

  const draft: DraftOrderInput = {
    eventId: ctx.eventId,
    tableNumber: ctx.table.number,
    guestName,
    message,
    requestedDeliveryPhase: phase,
    subtotalOre: totals.subtotalOre,
    vatOre: totals.vatOre,
    totalOre: totals.totalOre,
    lines,
  };

  return { ok: true, draft, stripeLines };
}

// Genberegner en Stripe-sessions samlede beløb i øre til webhook-kontrol.
export function stripeLinesTotalOre(lines: StripeLineInput[]): number {
  return lines.reduce((sum, l) => sum + l.unitAmountOre * l.quantity, 0);
}
