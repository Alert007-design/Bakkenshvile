// Ren servervalidering af et billetkøb. Browseren sender KUN showId,
// billettype-id'er + antal og tilvalg-id'er + antal — ALDRIG priser, navne
// eller beløb. Alle beløb genberegnes her ud fra Airtable-værdierne, så
// manipulation i browseren er uden virkning (samme princip som bord-
// bestillingens lib/checkout.ts).
//
// Funktionen er ren (ingen IO, ingen tid): kalderen slår forestillingen op
// (getShowDate), henter billettyper og tilvalg, afgør om rabatvinduet er åbent
// og sender det hele ind. Det gør valideringen fuldt testbar.

import type { ShowDate } from "@/lib/events";
import { isUpcoming } from "@/lib/events";
import { addonsTotalDiscountKr } from "@/lib/pricing";

/** Billettype som den slås op fra Airtable (priser i hele kroner). */
export interface TicketTypeDef {
  id: string;
  category: string;
  price: number;
  fee: number;
  maxCount: number;
  priceGroup: string;
}

/** Tilvalg som det slås op fra Airtable (fuld pris i hele kroner). */
export interface AddonDef {
  id: string;
  name: string;
  price: number;
}

/** Det browseren sender: kun id'er og antal. */
export interface TicketCheckoutBody {
  tickets: { ticketTypeId: string; quantity: number }[];
  addons: { addonId: string; quantity: number }[];
}

/** Alt det serveren slår op og sender ind i valideringen. */
export interface TicketCheckoutContext {
  /** Forestillingen fra getShowDate — null hvis showId er ukendt. */
  show: ShowDate | null;
  ticketTypes: TicketTypeDef[];
  addons: AddonDef[];
  /** Er onlinerabatten (10 % på tilvalg) aktiv for datoen? Beregnes serverside. */
  discountActive: boolean;
  /** Vises i billetlinjens navn ("Billet: <kategori> — <showlabel>"). */
  showLabel: string;
  /** Dagens dato i dansk tid (til afholdt-tjek). Default: isUpcoming's egen. */
  today?: string;
  /**
   * Tillad booking selvom showet er udsolgt. Bruges KUN af admin-fribilletter
   * (en æresgæst kan få plads til et udsolgt show); det almindelige billetkøb
   * sætter den aldrig.
   */
  allowSoldOut?: boolean;
}

/** Én valideret linje. Beløb i øre er ALTID fuld pris (rabatten er separat). */
export interface TicketCheckoutLine {
  kind: "ticket" | "addon";
  refId: string;
  description: string;
  unitAmountKr: number;
  quantity: number;
  amountSubtotalOre: number;
}

export interface TicketCheckoutTotals {
  ticketCount: number;
  subtotalKr: number;
  discountKr: number;
  totalKr: number;
  subtotalOre: number;
  discountOre: number;
  /** Det forventede total, betalingen oprettes på (linjesum − rabat). */
  totalOre: number;
}

export type TicketCheckoutResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      lines: TicketCheckoutLine[];
      totals: TicketCheckoutTotals;
      /** Billetkategorier, fx "A+ x2, B x1" — bygget af de validerede linjer. */
      ticketBreakdown: string;
      /** Tilvalg, én linje pr. vare ("Navn x2"), til bookingens tilvalgsfelt. */
      addonBreakdown: string;
    };

// Læser browserens antalsvalg robust: ukendt form → tom liste (behandles som
// "intet valgt" og fanges af "mindst én billet"-reglen).
function readSelections<K extends string>(
  raw: unknown,
  idKey: K
): { id: string; quantity: number }[] | "invalid" {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return "invalid";
  const out: { id: string; quantity: number }[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") return "invalid";
    const id = (it as Record<string, unknown>)[idKey];
    const quantity = (it as Record<string, unknown>).quantity;
    if (typeof id !== "string" || !id) return "invalid";
    if (typeof quantity !== "number" || !Number.isInteger(quantity)) return "invalid";
    out.push({ id, quantity });
  }
  return out;
}

/**
 * Validerer et billetkøb og beregner alle beløb ud fra Airtable-værdierne.
 * Håndhæver: kendt/kommende/ikke-udsolgt forestilling, kendte billettyper og
 * tilvalg, at billettypen hører til forestillingens prisgruppe, gyldige antal
 * (heltal ≥ 0, højst maxCount), og mindst én billet i alt. Onlinerabatten
 * gælder KUN tilvalg — aldrig billetpriser eller gebyrer.
 */
export function validateTicketCheckout(
  body: unknown,
  ctx: TicketCheckoutContext
): TicketCheckoutResult {
  const b = (body ?? {}) as Record<string, unknown>;

  // 1) Forestillingen skal findes, være kommende og ikke udsolgt.
  if (!ctx.show) {
    return { ok: false, status: 400, error: "Forestillingen findes ikke." };
  }
  if (!isUpcoming(ctx.show.date, ctx.today)) {
    return {
      ok: false,
      status: 400,
      error: "Denne dato er afholdt og kan ikke bestilles.",
    };
  }
  if (ctx.show.soldOut && !ctx.allowSoldOut) {
    return {
      ok: false,
      status: 400,
      error: "Denne dato er udsolgt og kan ikke bestilles.",
    };
  }

  // 2) Læs valgene. Ugyldig form afvises hårdt.
  const ticketSel = readSelections(b.tickets, "ticketTypeId");
  if (ticketSel === "invalid") {
    return { ok: false, status: 400, error: "Ugyldigt billetvalg." };
  }
  const addonSel = readSelections(b.addons, "addonId");
  if (addonSel === "invalid") {
    return { ok: false, status: 400, error: "Ugyldigt tilvalg." };
  }

  const ticketById = new Map(ctx.ticketTypes.map((t) => [t.id, t]));
  const addonById = new Map(ctx.addons.map((a) => [a.id, a]));

  // Læg antal sammen pr. id (dobbelte linjer for samme vare tillades).
  const ticketQty = new Map<string, number>();
  for (const s of ticketSel) {
    ticketQty.set(s.id, (ticketQty.get(s.id) ?? 0) + s.quantity);
  }
  const addonQty = new Map<string, number>();
  for (const s of addonSel) {
    addonQty.set(s.id, (addonQty.get(s.id) ?? 0) + s.quantity);
  }

  const lines: TicketCheckoutLine[] = [];
  const ticketCategoryTotals = new Map<string, number>();
  let ticketCount = 0;

  // 3) Billetlinjer.
  for (const [id, quantity] of ticketQty) {
    const t = ticketById.get(id);
    if (!t) {
      return { ok: false, status: 400, error: "Ukendt billettype." };
    }
    // Billettypen SKAL høre til forestillingens prisgruppe, ellers kunne en
    // billig prisgruppe parres med et dyrt show.
    if (t.priceGroup !== ctx.show.priceGroup) {
      return {
        ok: false,
        status: 400,
        error: "Billettypen hører ikke til den valgte forestilling.",
      };
    }
    if (quantity < 0) {
      return { ok: false, status: 400, error: "Ugyldigt antal." };
    }
    if (quantity > t.maxCount) {
      return {
        ok: false,
        status: 400,
        error: `Højst ${t.maxCount} af billettypen ${t.category}.`,
      };
    }
    if (quantity === 0) continue;

    const unitAmountKr = t.price + t.fee;
    lines.push({
      kind: "ticket",
      refId: t.id,
      description: `Billet: ${t.category} — ${ctx.showLabel}`,
      unitAmountKr,
      quantity,
      amountSubtotalOre: Math.round(unitAmountKr * 100) * quantity,
    });
    ticketCount += quantity;
    ticketCategoryTotals.set(
      t.category,
      (ticketCategoryTotals.get(t.category) ?? 0) + quantity
    );
  }

  // Mindst én billet i alt.
  if (ticketCount === 0) {
    return { ok: false, status: 400, error: "Vælg mindst én billet." };
  }

  // 4) Tilvalgslinjer (fuld pris — rabatten trækkes samlet fra bagefter).
  const addonSummary = new Map<string, number>();
  for (const [id, quantity] of addonQty) {
    const a = addonById.get(id);
    if (!a) {
      return { ok: false, status: 400, error: "Ukendt tilvalg." };
    }
    if (quantity < 0) {
      return { ok: false, status: 400, error: "Ugyldigt antal." };
    }
    if (quantity === 0) continue;

    lines.push({
      kind: "addon",
      refId: a.id,
      description: a.name,
      unitAmountKr: a.price,
      quantity,
      amountSubtotalOre: Math.round(a.price * 100) * quantity,
    });
    addonSummary.set(a.name, (addonSummary.get(a.name) ?? 0) + quantity);
  }

  // 5) Beløb. Rabatten (10 % på tilvalg) er summen af de enhedsfloorede
  // rabatter via den delte hjælpefunktion — nøjagtig samme tal som frontend
  // viser — og trækkes fra linjesummen, så linjerne summerer præcis til
  // totalen ligesom i dag. Nul når rabatvinduet er lukket.
  const subtotalOre = lines.reduce((s, l) => s + l.amountSubtotalOre, 0);
  const discountKr = ctx.discountActive
    ? addonsTotalDiscountKr(
        lines
          .filter((l) => l.kind === "addon")
          .map((l) => ({ unitKr: l.unitAmountKr, quantity: l.quantity }))
      )
    : 0;
  const discountOre = Math.round(discountKr * 100);
  const totalOre = subtotalOre - discountOre;

  const totals: TicketCheckoutTotals = {
    ticketCount,
    subtotalKr: Math.round(subtotalOre / 100),
    discountKr,
    totalKr: Math.round(subtotalOre / 100) - discountKr,
    subtotalOre,
    discountOre,
    totalOre,
  };

  const ticketBreakdown = Array.from(ticketCategoryTotals.entries())
    .map(([category, qty]) => `${category} x${qty}`)
    .join(", ");
  const addonBreakdown = Array.from(addonSummary.entries())
    .map(([name, qty]) => `${name} x${qty}`)
    .join("\n");

  return { ok: true, lines, totals, ticketBreakdown, addonBreakdown };
}
