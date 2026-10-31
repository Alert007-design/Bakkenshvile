import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMail = vi.fn();
vi.mock("@/lib/resend", () => ({
  sendMail: (...args: unknown[]) => sendMail(...args),
}));

import {
  meldSalg,
  salgFraBillet,
  salgFraGavekort,
  salgsmail,
  SALGSMAIL_TIL,
} from "@/lib/salgsmail";
import { vivaSourceCode } from "@/lib/payments/viva-client";
import type { TicketPaymentRow } from "@/lib/ticket-payments";
import type { GiftCardRow } from "@/lib/gift-cards";

function billet(over: Partial<TicketPaymentRow> = {}): TicketPaymentRow {
  return {
    paymentRef: "ref1",
    flow: "billet",
    bookingId: "rec1",
    bookingNo: "BH-1234",
    customerEmail: "gaest@example.dk",
    customerName: "Hanne Hansen",
    currency: "dkk",
    // 2 billetter à 429 + 2x30 gebyr = 918; 2 drinks à 99 = 198, rabat 20
    expectedTotalOre: 109600,
    discountOre: 2000,
    lineItems: [
      { description: "A+ (1.-3. rk.)", quantity: 2, amountSubtotalOre: 85800, kind: "ticket" },
      { description: "Gebyr", quantity: 2, amountSubtotalOre: 6000, kind: "ticket" },
      { description: "Aperol Spritz", quantity: 2, amountSubtotalOre: 19800, kind: "addon" },
    ],
    status: "paid",
    ...over,
  };
}

beforeEach(() => {
  sendMail.mockReset();
  sendMail.mockResolvedValue(undefined);
});

describe("salgFraBillet", () => {
  it("deler billetkøb op i billetter og drikkevarer efter rabat", () => {
    const s = salgFraBillet(billet());
    expect(s.type).toBe("Billetkøb");
    expect(s.drikkevarerOre).toBe(17800);
    expect(s.billetterOre).toBe(91800);
    expect(s.konto).toBe("Billetkontoen");
  });

  it("kan ikke opdele ældre rækker uden linjetype", () => {
    const s = salgFraBillet(
      billet({
        lineItems: [{ description: "Billet", quantity: 1, amountSubtotalOre: 109600 }],
      })
    );
    expect(s.drikkevarerOre).toBeNull();
    expect(s.billetterOre).toBeNull();
    expect(salgsmail(s).html).toContain("Billetter og evt. drikkevarer");
  });

  it("genbestilling er drikkevarer til barkontoen", () => {
    const s = salgFraBillet(billet({ flow: "genbestil", expectedTotalOre: 17800 }));
    expect(s.type).toBe("Drikkevarer");
    expect(s.drikkevarerOre).toBe(17800);
    expect(s.konto).toBe("Barkontoen");
  });
});

describe("salgFraGavekort", () => {
  it("gavekort afregnes til barkontoen", () => {
    const s = salgFraGavekort({
      giftCardNo: "GK-1",
      amountOre: 50000,
      purchaserName: "Ib",
      purchaserEmail: "ib@example.dk",
    } as GiftCardRow);
    expect(s.type).toBe("Gavekort");
    expect(s.totalOre).toBe(50000);
    expect(s.konto).toBe("Barkontoen");
  });
});

describe("meldSalg", () => {
  it("sender til Dot med type, beløb og reference i emnet", async () => {
    sendMail.mockResolvedValue(undefined);
    await meldSalg(salgFraBillet(billet()));
    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe(SALGSMAIL_TIL);
    expect(SALGSMAIL_TIL).toBe("dot@bakkenshvile.dk");
    expect(arg.subject).toContain("Billetkøb");
    expect(arg.subject).toContain("BH-1234");
    expect(arg.html).toContain("Drikkevarer efter onlinerabat");
  });

  it("kaster aldrig, selv om mailen fejler", async () => {
    sendMail.mockImplementation(async () => {
      throw new Error("Resend nede");
    });
    let kastede = false;
    try {
      await meldSalg(salgFraBillet(billet()));
    } catch {
      kastede = true;
    }
    expect(kastede).toBe(false);
  });
});

describe("vivaSourceCode('drinks')", () => {
  const gemt = { ...process.env };
  afterEach(() => {
    process.env = { ...gemt };
  });

  it("bruger drikkevare-sourcen, når den er sat", () => {
    process.env.VIVA_SOURCE_CODE_TICKETS = "6238";
    process.env.VIVA_SOURCE_CODE_DRINKS = "7777";
    expect(vivaSourceCode("drinks")).toBe("7777");
  });

  it("falder tilbage til billet-sourcen, når den ikke er sat", () => {
    process.env.VIVA_SOURCE_CODE_TICKETS = "6238";
    delete process.env.VIVA_SOURCE_CODE_DRINKS;
    expect(vivaSourceCode("drinks")).toBe("6238");
  });
});
