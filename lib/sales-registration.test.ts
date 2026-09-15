import { describe, it, expect, afterEach } from "vitest";
import {
  getSalesRegistration,
  getSalesRegistrationMode,
  NoSalesRegistration,
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
  delete process.env.SALES_REGISTRATION;
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

describe("none-tilstand — ingen ekstern registrering", () => {
  it("registrerer betalt ordre i loggen og fejler ikke", async () => {
    const lines: string[] = [];
    const reg = new NoSalesRegistration((m) => lines.push(m));
    const res = await reg.registerPaidOrder(paidOrder());
    expect(res.ok).toBe(true);
    expect(res.mode).toBe("none");
    expect(res.reference).toBe("BH-B-00001");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("BH-B-00001");
    expect(lines[0]).toContain("10000 øre");
  });

  it("refundering registreres uden at kaste", async () => {
    const lines: string[] = [];
    const reg = new NoSalesRegistration((m) => lines.push(m));
    const res = await reg.registerRefund({
      orderId: "o1",
      orderNumber: "BH-B-00001",
      totalOre: 10000,
      refundedAt: "2026-07-27T21:00:00Z",
    });
    expect(res.mode).toBe("none");
    expect(lines[0]).toContain("Refundering");
  });

  it("dagsafslutning kaster ikke", async () => {
    const reg = new NoSalesRegistration(() => {});
    await expect(reg.closeBusinessDay("evt1")).resolves.toMatchObject({
      eventId: "evt1",
    });
  });
});

describe("valg af tilstand", () => {
  it("er testtilstand som standard uden live", () => {
    expect(getSalesRegistrationMode()).toBe("test");
  });

  it("er none i live-tilstand — livebetaling spærres ikke længere", async () => {
    process.env.TABLE_ORDERING_LIVE = "true";
    expect(getSalesRegistrationMode()).toBe("none");
    const res = await getSalesRegistration().registerPaidOrder(paidOrder());
    expect(res.ok).toBe(true);
    expect(res.mode).toBe("none");
  });

  it("SALES_REGISTRATION vinder over driftstilstanden", () => {
    process.env.TABLE_ORDERING_LIVE = "true";
    process.env.SALES_REGISTRATION = "test";
    expect(getSalesRegistrationMode()).toBe("test");
  });

  it("en slåfejl falder tilbage på driftstilstanden i stedet for at kaste", () => {
    process.env.TABLE_ORDERING_LIVE = "true";
    process.env.SALES_REGISTRATION = "non";
    expect(getSalesRegistrationMode()).toBe("none");
  });
});

describe("krogen til et eksternt kassesystem er bevaret", () => {
  it("kaster stadig, indtil en rigtig implementering er koblet på", async () => {
    const reg = new UnconfiguredLiveSalesRegistration();
    await expect(reg.registerPaidOrder(paidOrder())).rejects.toBeInstanceOf(
      SalesRegistrationError
    );
  });

  it("SALES_REGISTRATION=live vælger krogen", async () => {
    process.env.SALES_REGISTRATION = "live";
    await expect(
      getSalesRegistration().registerPaidOrder(paidOrder())
    ).rejects.toBeInstanceOf(SalesRegistrationError);
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
