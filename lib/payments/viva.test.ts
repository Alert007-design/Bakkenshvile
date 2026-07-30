import { describe, it, expect } from "vitest";
import { kronerToOre, mapVivaStatus, vivaProvider } from "@/lib/payments/viva";
import { extractOrderCode } from "@/lib/payments/viva-client";

describe("kronerToOre — Viva kroner (decimaltal) → øre", () => {
  it("konverterer korrekt (Viva returnerer altid højst to decimaler)", () => {
    expect(kronerToOre(100.5)).toBe(10050);
    expect(kronerToOre(8.15)).toBe(815);
    expect(kronerToOre(75)).toBe(7500);
  });

  it("accepterer tal som streng (fra rå payload)", () => {
    expect(kronerToOre("8.15")).toBe(815);
  });

  it("kaster på ugyldigt beløb", () => {
    expect(() => kronerToOre(NaN)).toThrow();
    expect(() => kronerToOre("abc")).toThrow();
  });
});

describe("mapVivaStatus — kun 'F' er betalt", () => {
  it("'F' og 'f' giver paid", () => {
    expect(mapVivaStatus("F")).toBe("paid");
    expect(mapVivaStatus("f")).toBe("paid");
  });

  it("alt andet giver aldrig paid (fail-closed)", () => {
    for (const s of ["A", "C", "E", "X", "", "finished", "1", "unknown"]) {
      expect(mapVivaStatus(s)).not.toBe("paid");
      expect(mapVivaStatus(s)).toBe("pending");
    }
  });
});

describe("extractOrderCode — 16-cifret orderCode bevares som streng", () => {
  it("læser orderCode uden præcisionstab", () => {
    const orderCode = "9007199254740993"; // 16 cifre, > Number.MAX_SAFE_INTEGER
    const raw = `{"orderCode":${orderCode},"amount":100.5,"statusId":"F"}`;
    const parsed = extractOrderCode(raw);
    expect(parsed).toBe(orderCode);
    // JSON.parse ville miste præcision — bevis at strengen ikke er gået gennem et tal.
    expect(String(Number(orderCode))).not.toBe(orderCode);
  });

  it("håndterer orderCode i anførselstegn", () => {
    expect(extractOrderCode('{"orderCode":"9999999999999999"}')).toBe("9999999999999999");
  });

  it("returnerer null når feltet mangler", () => {
    expect(extractOrderCode('{"amount":100}')).toBeNull();
  });
});

describe("vivaProvider.verifyPayment", () => {
  it("returnerer null uden transactionId (kalder ikke Viva)", async () => {
    expect(await vivaProvider.verifyPayment({})).toBeNull();
    expect(await vivaProvider.verifyPayment({ paymentRef: "1234567890123456" })).toBeNull();
    expect(await vivaProvider.verifyPayment({ transactionId: null })).toBeNull();
  });
});

describe("vivaProvider.createPayment", () => {
  it("genbruger existingRef uden at kalde Viva", async () => {
    const ref = "1234567890123456";
    const result = await vivaProvider.createPayment({
      orderId: "o1",
      orderNumber: "BH-B-00001",
      publicToken: "tok",
      eventId: "evt1",
      tableNumber: 63,
      totalOre: 10000,
      currency: "dkk",
      description: "Bakkens Hvile · bord 63",
      origin: "https://bakkenshvile.dk",
      expiresInMinutes: 30,
      existingRef: ref,
    });
    expect(result.paymentRef).toBe(ref);
    expect(result.redirectUrl).toContain(`ref=${ref}`);
  });
});
