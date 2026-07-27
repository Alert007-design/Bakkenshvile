import { describe, it, expect } from "vitest";
import {
  canTransitionFulfillment,
  canTransitionPayment,
  assertFulfillmentTransition,
  assertPaymentTransition,
  FULFILLMENT_TIMESTAMP,
  type FulfillmentStatus,
  type PaymentStatus,
} from "@/lib/order-status";

describe("leveringsstatus — gyldige overgange", () => {
  it("tillader det normale forløb new → preparing → ready → delivered", () => {
    expect(canTransitionFulfillment("new", "preparing")).toBe(true);
    expect(canTransitionFulfillment("preparing", "ready")).toBe(true);
    expect(canTransitionFulfillment("ready", "delivered")).toBe(true);
  });

  it("tillader annullering fra alle ikke-afsluttede tilstande", () => {
    expect(canTransitionFulfillment("new", "cancelled")).toBe(true);
    expect(canTransitionFulfillment("preparing", "cancelled")).toBe(true);
    expect(canTransitionFulfillment("ready", "cancelled")).toBe(true);
  });

  it("afviser spring og baglæns overgange", () => {
    expect(canTransitionFulfillment("new", "ready")).toBe(false);
    expect(canTransitionFulfillment("new", "delivered")).toBe(false);
    expect(canTransitionFulfillment("ready", "preparing")).toBe(false);
    expect(canTransitionFulfillment("delivered", "ready")).toBe(false);
  });

  it("slutttilstande kan ikke forlades", () => {
    for (const to of ["new", "preparing", "ready", "delivered", "cancelled"] as FulfillmentStatus[]) {
      expect(canTransitionFulfillment("delivered", to)).toBe(false);
      expect(canTransitionFulfillment("cancelled", to)).toBe(false);
    }
  });

  it("assert kaster ved ugyldig overgang", () => {
    expect(() => assertFulfillmentTransition("new", "delivered")).toThrow();
    expect(() => assertFulfillmentTransition("new", "preparing")).not.toThrow();
  });
});

describe("betalingsstatus — gyldige overgange", () => {
  it("pending kan blive paid eller failed", () => {
    expect(canTransitionPayment("pending", "paid")).toBe(true);
    expect(canTransitionPayment("pending", "failed")).toBe(true);
  });

  it("kun paid kan refunderes", () => {
    expect(canTransitionPayment("paid", "refunded")).toBe(true);
    expect(canTransitionPayment("pending", "refunded")).toBe(false);
    expect(canTransitionPayment("failed", "refunded")).toBe(false);
  });

  it("slutttilstande kan ikke forlades", () => {
    for (const to of ["pending", "paid", "failed", "refunded"] as PaymentStatus[]) {
      expect(canTransitionPayment("refunded", to)).toBe(false);
      expect(canTransitionPayment("failed", to)).toBe(false);
    }
  });

  it("assert kaster ved ugyldig overgang", () => {
    expect(() => assertPaymentTransition("pending", "refunded")).toThrow();
    expect(() => assertPaymentTransition("pending", "paid")).not.toThrow();
  });
});

describe("tidsstempler pr. overgang", () => {
  it("mapper hver leveringstilstand til det rigtige tidsstempelfelt", () => {
    expect(FULFILLMENT_TIMESTAMP.preparing).toBe("startedAt");
    expect(FULFILLMENT_TIMESTAMP.ready).toBe("readyAt");
    expect(FULFILLMENT_TIMESTAMP.delivered).toBe("deliveredAt");
    expect(FULFILLMENT_TIMESTAMP.cancelled).toBe("cancelledAt");
    expect(FULFILLMENT_TIMESTAMP.new).toBeNull();
  });
});
