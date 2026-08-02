import { describe, it, expect, afterEach } from "vitest";
import {
  getSalesRegistration,
  TestSalesRegistration,
  UnconfiguredLiveSalesRegistration,
  SalesRegistrationError,
  orderToCsvRows,
  type PaidOrder,
} from "@/lib/sales-registration";
import { assertVivaLiveAllowed } from "@/lib/payments";

function paidOrder(): PaidOrder {
  return {
    orderId: "o1",
    orderNumber: "BH-B-00001",
    eventId: "evt1",
    tableNumber: 63,
    currency: "dkk",
    subtotalOre: 8000,
    vatOre: 2000,
    totalOre: 10000,
    paidAt: "2026-07-27T20:00:00Z",
    lines: [
      {
        name: "Øl, 1/2 liter",
        productCode: "OL-01",
        quantity: 2,
        unitPriceOre: 5000,
        vatRate: 25,
        lineTotalOre: 10000,
      },
    ],
  };
}

afterEach(() => {
  delete process.env.TABLE_ORDERING_LIVE;
  delete process.env.VIVA_ENV;
});

describe("CSV til intern kontrol", () => {
  it("laver én linje pr. ordrelinje og citerer felter med komma", () => {
    const rows = orderToCsvRows(paidOrder());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('"Øl, 1/2 liter"'); // komma citeret
    expect(rows[0]).toContain("BH-B-00001");
    expect(rows[0]).toContain("OL-01");
  });
});

describe("testtilstand", () => {
  it("registrerer salg og sender CSV til sink", async () => {
    let captured: string[] = [];
    const reg = new TestSalesRegistration((rows) => {
      captured = rows;
    });
    const res = await reg.registerPaidOrder(paidOrder());
    expect(res.ok).toBe(true);
    expect(res.mode).toBe("test");
    expect(captured).toHaveLength(1);
  });
});

describe("live-tilstand uden konfigureret system — fejler lukket", () => {
  it("kaster ved registrering af betalt ordre", async () => {
    const reg = new UnconfiguredLiveSalesRegistration();
    await expect(reg.registerPaidOrder(paidOrder())).rejects.toBeInstanceOf(
      SalesRegistrationError
    );
  });

  it("getSalesRegistration returnerer fail-closed i live-tilstand", async () => {
    process.env.TABLE_ORDERING_LIVE = "true";
    const reg = getSalesRegistration();
    await expect(reg.registerPaidOrder(paidOrder())).rejects.toBeInstanceOf(
      SalesRegistrationError
    );
  });

  it("getSalesRegistration er testtilstand som standard", async () => {
    const reg = getSalesRegistration();
    const res = await reg.registerPaidOrder(paidOrder());
    expect(res.mode).toBe("test");
  });
});

describe("assertVivaLiveAllowed (bord) — livebetaling umulig uden live-tilstand", () => {
  it("kaster ved VIVA_ENV=live når TABLE_ORDERING_LIVE ikke er true", () => {
    process.env.VIVA_ENV = "live";
    expect(() => assertVivaLiveAllowed("table")).toThrow();
  });

  it("tillader demo-miljø uanset tilstand", () => {
    process.env.VIVA_ENV = "demo";
    expect(() => assertVivaLiveAllowed("table")).not.toThrow();
  });

  it("tillader live når live-tilstand er slået til", () => {
    process.env.VIVA_ENV = "live";
    process.env.TABLE_ORDERING_LIVE = "true";
    expect(() => assertVivaLiveAllowed("table")).not.toThrow();
  });
});
