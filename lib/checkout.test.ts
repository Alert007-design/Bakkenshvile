import { describe, it, expect } from "vitest";
import { validateCheckout, paymentLinesTotalOre, type CheckoutContext } from "@/lib/checkout";
import type { MenuItem } from "@/lib/menu";
import { getTable } from "@/lib/tables";
import { MAX_PER_ITEM, MAX_TOTAL_ITEMS } from "@/lib/table-ordering-config";

function menuItem(id: string, overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id,
    productCode: id.toUpperCase(),
    name: "Øl",
    description: "",
    group: "Fadøl",
    unitPriceOre: 5000,
    vatRate: 25,
    sort: 0,
    ...overrides,
  };
}

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    table: getTable(63),
    tokenValid: true,
    orderingOpen: true,
    eventId: "evt1",
    menu: new Map([["rec1", menuItem("rec1")]]),
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    guestName: "Anna",
    requestedDeliveryPhase: "now",
    items: [{ menuItemId: "rec1", quantity: 2 }],
    ...overrides,
  };
}

describe("validateCheckout — adgang og token", () => {
  it("afviser ukendt bord", () => {
    const r = validateCheckout(body(), ctx({ table: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("afviser ugyldigt token", () => {
    const r = validateCheckout(body(), ctx({ tokenValid: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("afviser når bestilling er lukket", () => {
    const r = validateCheckout(body(), ctx({ orderingOpen: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
});

describe("validateCheckout — input", () => {
  it("kræver navn", () => {
    expect(validateCheckout(body({ guestName: "  " }), ctx()).ok).toBe(false);
  });

  it("kræver gyldig leveringsfase", () => {
    expect(validateCheckout(body({ requestedDeliveryPhase: "senere" }), ctx()).ok).toBe(false);
  });

  it("kræver mindst én vare", () => {
    expect(validateCheckout(body({ items: [] }), ctx()).ok).toBe(false);
    expect(validateCheckout(body({ items: "nope" }), ctx()).ok).toBe(false);
  });

  it("afviser ikke-heltal antal", () => {
    expect(validateCheckout(body({ items: [{ menuItemId: "rec1", quantity: 1.5 }] }), ctx()).ok).toBe(
      false
    );
  });
});

describe("validateCheckout — varer og priser (server autoritativ)", () => {
  it("ignorerer en pris sendt fra browseren og bruger menuens fulde pris", () => {
    const r = validateCheckout(
      body({ items: [{ menuItemId: "rec1", quantity: 1, unitAmount: 1, price: 1 }] }),
      ctx()
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Bord-/QR-bestilling er altid fuld pris: 50 kr.
      expect(r.draft.lines[0].unitPriceOre).toBe(5000);
      expect(r.draft.totalOre).toBe(5000);
    }
  });

  it("afviser en vare der ikke er i den aktive menu (ukendt/inaktiv)", () => {
    const r = validateCheckout(body({ items: [{ menuItemId: "ukendt", quantity: 1 }] }), ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });

  it("håndhæver maks pr. vare", () => {
    const r = validateCheckout(
      body({ items: [{ menuItemId: "rec1", quantity: MAX_PER_ITEM + 1 }] }),
      ctx()
    );
    expect(r.ok).toBe(false);
  });

  it("håndhæver maks antal varer i alt", () => {
    // Mange varer i menuen, hver med lav pris, samlet antal over grænsen.
    const menu = new Map<string, MenuItem>();
    const items: { menuItemId: string; quantity: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const id = `rec${i}`;
      menu.set(id, menuItem(id, { unitPriceOre: 100 }));
      items.push({ menuItemId: id, quantity: 10 }); // 5 * 10 = 50 > 40
    }
    const r = validateCheckout(body({ items }), ctx({ menu }));
    expect(r.ok).toBe(false);
  });

  it("lægger dobbelte linjer for samme vare sammen", () => {
    const r = validateCheckout(
      body({
        items: [
          { menuItemId: "rec1", quantity: 1 },
          { menuItemId: "rec1", quantity: 2 },
        ],
      }),
      ctx()
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft.lines).toHaveLength(1);
      expect(r.draft.lines[0].quantity).toBe(3);
      // 3 × fuld pris 50 kr = 150 kr.
      expect(r.draft.totalOre).toBe(15000);
    }
  });

  it("beregner subtotal/moms/total korrekt i øre (fuld pris)", () => {
    const r = validateCheckout(body({ items: [{ menuItemId: "rec1", quantity: 2 }] }), ctx());
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 2 × fuld pris 50 kr = 100 kr.
      expect(r.draft.totalOre).toBe(10000);
      expect(r.draft.vatOre).toBe(2000); // 10000 * 25/125
      expect(r.draft.subtotalOre).toBe(8000);
      expect(paymentLinesTotalOre(r.paymentLines)).toBe(10000);
    }
  });
});
