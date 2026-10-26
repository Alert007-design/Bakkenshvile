import { describe, it, expect, vi, beforeEach } from "vitest";

const getRecord = vi.fn();
const updateRecord = vi.fn();
vi.mock("@/lib/airtable", () => ({
  getRecord: (...a: unknown[]) => getRecord(...a),
  updateRecord: (...a: unknown[]) => updateRecord(...a),
  TABLES: { bookings: "Bookings" },
  FIELDS: {
    booking: {
      discount: "Rabat",
      totalPaid: "Betalt i alt",
      addons: "Tilvalg",
    },
  },
}));

const sendMail = vi.fn();
vi.mock("@/lib/resend", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  EMAIL_REPLY_TO: "kontor@bakkenshvile.dk",
}));

import { fulfillGenbestilling } from "@/lib/genbestil-fulfill";
import type { TicketPaymentRow } from "@/lib/ticket-payments";

const payment: TicketPaymentRow = {
  paymentRef: "1234567890123456",
  flow: "genbestil",
  bookingId: "recBOOK",
  bookingNo: "BH-K7M2Q9XR",
  customerEmail: "gaest@example.dk",
  customerName: "Gæst",
  currency: "DKK",
  expectedTotalOre: 17820,
  discountOre: 1980,
  lineItems: [
    { description: "Aperol Spritz", quantity: 2, amountSubtotalOre: 19800 },
  ],
  status: "paid",
};

beforeEach(() => {
  getRecord.mockReset();
  updateRecord.mockReset();
  sendMail.mockReset();
  getRecord.mockResolvedValue({
    id: "recBOOK",
    fields: { Rabat: 0, "Betalt i alt": 858, Tilvalg: "" },
  });
  updateRecord.mockResolvedValue({});
});

describe("fulfillGenbestilling", () => {
  it("lægger drinks og beløb på bookingen og sender bekræftelsen", async () => {
    sendMail.mockResolvedValue(undefined);
    await fulfillGenbestilling(payment);
    expect(updateRecord).toHaveBeenCalledTimes(1);
    const felter = updateRecord.mock.calls[0][2];
    expect(felter["Betalt i alt"]).toBe(858 + 178);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe("gaest@example.dk");
  });

  it("kaster IKKE, når bekræftelsesmailen fejler efter Airtable er opdateret", async () => {
    // Kastede den, ville webhooken rulle betalingen tilbage, Viva ville prøve
    // igen, og drinksene ville blive lagt på bookingen en gang til.
    sendMail
      .mockRejectedValueOnce(new Error("Resend nede")) // kundens mail
      .mockResolvedValueOnce(undefined); // advarsel til kontoret
    await expect(fulfillGenbestilling(payment)).resolves.toBeUndefined();
    expect(updateRecord).toHaveBeenCalledTimes(1);
  });

  it("giver kontoret besked, når gæstens bekræftelse ikke kunne sendes", async () => {
    sendMail
      .mockRejectedValueOnce(new Error("Resend nede"))
      .mockResolvedValueOnce(undefined);
    await fulfillGenbestilling(payment);
    expect(sendMail).toHaveBeenCalledTimes(2);
    const advarsel = sendMail.mock.calls[1][0];
    expect(advarsel.to).toBe("kontor@bakkenshvile.dk");
    expect(advarsel.subject).toContain("BH-K7M2Q9XR");
  });

  it("kaster stadig, hvis Airtable-opdateringen fejler (intet skrevet, sikkert at prøve igen)", async () => {
    updateRecord.mockRejectedValue(new Error("Airtable nede"));
    await expect(fulfillGenbestilling(payment)).rejects.toThrow();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sender ingen mail uden kundens mailadresse", async () => {
    await fulfillGenbestilling({ ...payment, customerEmail: null });
    expect(updateRecord).toHaveBeenCalledTimes(1);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
