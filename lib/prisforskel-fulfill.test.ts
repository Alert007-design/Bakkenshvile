import { describe, it, expect, vi, beforeEach } from "vitest";

const getRecord = vi.fn();
const updateRecord = vi.fn();
vi.mock("@/lib/airtable", () => ({
  getRecord: (...a: unknown[]) => getRecord(...a),
  updateRecord: (...a: unknown[]) => updateRecord(...a),
  TABLES: { bookings: "Bookings" },
  FIELDS: { booking: { totalPaid: "Betalt i alt", specialRequests: "Særlige ønsker" } },
}));

const sendMail = vi.fn();
vi.mock("@/lib/resend", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  EMAIL_REPLY_TO: "kontor@bakkenshvile.dk",
}));

const advar = vi.fn();
vi.mock("@/lib/payment-alerts", () => ({
  advarOmManglendeBekraeftelse: (...a: unknown[]) => advar(...a),
}));

import { fulfillPrisforskel } from "@/lib/prisforskel-fulfill";
import type { TicketPaymentRow } from "@/lib/ticket-payments";

const payment: TicketPaymentRow = {
  paymentRef: "9100000000001",
  flow: "prisforskel",
  bookingId: "recBOOK",
  bookingNo: "BH-K7M2Q9XR",
  customerEmail: "hanne@example.dk",
  customerName: "Hanne Hansen",
  currency: "DKK",
  expectedTotalOre: 13000,
  discountOre: 0,
  lineItems: [
    { description: "Prisforskel ved flytning til 22. maj 2027", quantity: 1, amountSubtotalOre: 13000, kind: "ticket" },
  ],
  status: "paid",
};

beforeEach(() => {
  vi.clearAllMocks();
  getRecord.mockResolvedValue({
    id: "recBOOK",
    fields: { "Betalt i alt": 787, "Særlige ønsker": "Flyttet fra x til y | Prisforskel 130 kr. afventer betaling" },
  });
  updateRecord.mockResolvedValue({});
  sendMail.mockResolvedValue(undefined);
});

describe("fulfillPrisforskel", () => {
  it("lægger beløbet på Betalt i alt, skriver en note og sender kvittering", async () => {
    await fulfillPrisforskel(payment);
    expect(updateRecord).toHaveBeenCalledTimes(1);
    const felter = updateRecord.mock.calls[0][2];
    expect(felter["Betalt i alt"]).toBe(787 + 130);
    expect(felter["Særlige ønsker"]).toBe(
      "Flyttet fra x til y | Prisforskel 130 kr. afventer betaling | Prisforskel 130 kr. betalt"
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe("hanne@example.dk");
    expect(sendMail.mock.calls[0][0].subject).toContain("BH-K7M2Q9XR");
  });

  it("kaster, når Airtable fejler, så Viva kan prøve igen", async () => {
    updateRecord.mockRejectedValue(new Error("nede"));
    await expect(fulfillPrisforskel(payment)).rejects.toThrow();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("kaster ikke, når kvitteringen fejler, men giver kontoret besked", async () => {
    sendMail.mockRejectedValue(new Error("Resend nede"));
    await expect(fulfillPrisforskel(payment)).resolves.toBeUndefined();
    expect(advar).toHaveBeenCalledTimes(1);
  });
});
