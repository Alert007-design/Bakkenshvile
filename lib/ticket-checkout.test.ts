import { describe, it, expect } from "vitest";
import {
  validateTicketCheckout,
  type TicketCheckoutContext,
  type TicketTypeDef,
  type AddonDef,
} from "@/lib/ticket-checkout";
import type { ShowDate } from "@/lib/events";

const TODAY = "2026-08-01";

function show(overrides: Partial<ShowDate> = {}): ShowDate {
  return {
    id: "rec12345678901234",
    title: "Ordinær forestilling",
    date: "2026-08-15",
    time: "19:00",
    duration: "2 timer",
    notes: "",
    priceGroup: "Ordinær",
    soldOut: false,
    ...overrides,
  };
}

const TICKETS: TicketTypeDef[] = [
  { id: "tkAplus", category: "A+", price: 495, fee: 25, maxCount: 10, priceGroup: "Ordinær" },
  { id: "tkB", category: "B", price: 295, fee: 25, maxCount: 10, priceGroup: "Ordinær" },
  // Billettype fra en anden prisgruppe — må aldrig kunne parres med showet ovenfor.
  { id: "tkForpremiere", category: "A+", price: 100, fee: 0, maxCount: 10, priceGroup: "Forpremiere" },
];

const ADDONS: AddonDef[] = [{ id: "adBeer", name: "Fadøl", price: 65 }];

function ctx(overrides: Partial<TicketCheckoutContext> = {}): TicketCheckoutContext {
  return {
    show: show(),
    ticketTypes: TICKETS,
    addons: ADDONS,
    discountActive: true,
    showLabel: "lør 15. august kl. 19:00",
    today: TODAY,
    ...overrides,
  };
}

describe("validateTicketCheckout — forestillingens tilstand", () => {
  it("afviser ukendt showId (show = null)", () => {
    const r = validateTicketCheckout(
      { tickets: [{ ticketTypeId: "tkAplus", quantity: 1 }], addons: [] },
      ctx({ show: null })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("afviser en afholdt dato", () => {
    const r = validateTicketCheckout(
      { tickets: [{ ticketTypeId: "tkAplus", quantity: 1 }], addons: [] },
      ctx({ show: show({ date: "2026-07-31" }) })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("afviser et udsolgt event", () => {
    const r = validateTicketCheckout(
      { tickets: [{ ticketTypeId: "tkAplus", quantity: 1 }], addons: [] },
      ctx({ show: show({ soldOut: true }) })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("tillader udsolgt event når allowSoldOut er sat (fribillet)", () => {
    const r = validateTicketCheckout(
      { tickets: [{ ticketTypeId: "tkAplus", quantity: 1 }], addons: [] },
      ctx({ show: show({ soldOut: true }), allowSoldOut: true })
    );
    expect(r.ok).toBe(true);
  });

  it("allowSoldOut åbner ikke for afholdte datoer", () => {
    const r = validateTicketCheckout(
      { tickets: [{ ticketTypeId: "tkAplus", quantity: 1 }], addons: [] },
      ctx({ show: show({ date: "2026-07-31", soldOut: true }), allowSoldOut: true })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });
});

describe("validateTicketCheckout — billettyper", () => {
  it("afviser en billettype hvis prisgruppe ikke matcher showet", () => {
    const r = validateTicketCheckout(
      { tickets: [{ ticketTypeId: "tkForpremiere", quantity: 1 }], addons: [] },
      ctx()
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("afviser en ukendt billettype", () => {
    const r = validateTicketCheckout(
      { tickets: [{ ticketTypeId: "findes-ikke", quantity: 1 }], addons: [] },
      ctx()
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("håndhæver maxCount for billettypen", () => {
    const r = validateTicketCheckout(
      { tickets: [{ ticketTypeId: "tkAplus", quantity: 11 }], addons: [] },
      ctx()
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("kræver mindst én billet i alt", () => {
    const r = validateTicketCheckout(
      { tickets: [{ ticketTypeId: "tkAplus", quantity: 0 }], addons: [{ addonId: "adBeer", quantity: 2 }] },
      ctx()
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });
});

describe("validateTicketCheckout — beløb er serverautoritative", () => {
  it("ignorerer priser sendt fra browseren og bruger Airtable-værdierne", () => {
    const r = validateTicketCheckout(
      {
        // Ekstra pris-/beløbsfelter i input skal være uden virkning.
        tickets: [{ ticketTypeId: "tkAplus", quantity: 2, unitAmount: 1, price: 1 }],
        addons: [],
      },
      ctx({ discountActive: false })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 2 × (495 + 25) = 1040 kr.
      expect(r.totals.totalOre).toBe(104000);
      expect(r.totals.ticketCount).toBe(2);
      expect(r.lines[0].amountSubtotalOre).toBe(104000);
    }
  });

  it("bygger ticketBreakdown af de validerede linjer", () => {
    const r = validateTicketCheckout(
      {
        tickets: [
          { ticketTypeId: "tkAplus", quantity: 2 },
          { ticketTypeId: "tkB", quantity: 1 },
        ],
        addons: [],
      },
      ctx()
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ticketBreakdown).toBe("A+ x2, B x1");
  });

  it("rabatten rammer kun tilvalg — en billet med gebyr får præcis fuld pris", () => {
    const r = validateTicketCheckout(
      {
        tickets: [{ ticketTypeId: "tkAplus", quantity: 1 }],
        addons: [{ addonId: "adBeer", quantity: 2 }],
      },
      ctx({ discountActive: true })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ticketLine = r.lines.find((l) => l.kind === "ticket")!;
      // Billet: fuld pris 495 + 25 gebyr = 520 kr, ingen rabat.
      expect(ticketLine.unitAmountKr).toBe(520);
      expect(ticketLine.amountSubtotalOre).toBe(52000);
      // Tilvalg: rabat = floor(65 * 0,10) = 6 kr pr. enhed × 2 = 12 kr.
      expect(r.totals.discountKr).toBe(12);
      // Subtotal 520 + 2×65 = 650 kr; total 650 − 12 = 638 kr.
      expect(r.totals.subtotalKr).toBe(650);
      expect(r.totals.totalKr).toBe(638);
      expect(r.totals.totalOre).toBe(63800);
    }
  });

  it("giver ingen rabat når rabatvinduet er lukket", () => {
    const r = validateTicketCheckout(
      {
        tickets: [{ ticketTypeId: "tkAplus", quantity: 1 }],
        addons: [{ addonId: "adBeer", quantity: 2 }],
      },
      ctx({ discountActive: false })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totals.discountKr).toBe(0);
      // 520 + 130 = 650 kr, ingen rabat.
      expect(r.totals.totalOre).toBe(65000);
    }
  });
});
