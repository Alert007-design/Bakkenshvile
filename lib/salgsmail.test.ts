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
    expect(salgsmail(s).html).toContain("Billetter og drikkevarer");
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

describe("salgsmail viser udførligt, hvad der er købt", () => {
  const forestilling = {
    titel: "Forpremiere – 150 års jubilæums show 2027",
    datoIso: "2027-05-10",
    tid: "19:30",
    pladser: "A+ (1.-3. rk.) x2",
  };

  it("lister hver vare med antal og beløb, rabat og total", () => {
    const html = salgsmail(salgFraBillet(billet(), forestilling)).html;
    expect(html).toContain("A+ (1.-3. rk.)");
    expect(html).toContain("858 kr.");
    expect(html).toContain("Aperol Spritz");
    expect(html).toContain("198 kr.");
    expect(html).toContain("&minus;20 kr.");
    expect(html).toContain("1.096 kr.");
  });

  it("viser forestilling, dato, klokkeslæt og pladser", () => {
    const html = salgsmail(salgFraBillet(billet(), forestilling)).html;
    expect(html).toContain("Forpremiere");
    expect(html).toContain("mandag den 10. maj 2027");
    expect(html).toContain("kl. 19:30");
    expect(html).toContain("2 x A+ (1.-3. rk.)");
  });

  it("viser kundens navn og mail som oplysninger, ikke som varer til 0 kr.", () => {
    const html = salgsmail(salgFraBillet(billet())).html;
    expect(html).toContain("Hanne Hansen");
    expect(html).toContain("gaest@example.dk");
    expect(html).not.toContain(">0 kr.</td>");
    expect(html).not.toMatch(/Kunde: /);
  });

  it("viser kundens postnummer, by og adresse", () => {
    const html = salgsmail(
      salgFraBillet(billet(), {
        ...forestilling,
        kundeAdresse: { adresse: "Strandvejen 1", postnummer: "2930", by: "Klampenborg" },
      })
    ).html;
    expect(html).toContain("2930 Klampenborg");
    expect(html).toContain("Strandvejen 1");
  });

  it("viser kun postnummeret, når vej og by mangler", () => {
    const html = salgsmail(
      salgFraBillet(billet(), {
        ...forestilling,
        kundeAdresse: { adresse: "", postnummer: "8000", by: "" },
      })
    ).html;
    expect(html).toContain(">8000</td>");
    expect(html).not.toContain(">Adresse</td>");
  });

  it("klarer sig uden forestillingsdata", () => {
    const html = salgsmail(salgFraBillet(billet(), null)).html;
    expect(html).not.toContain(">Forestilling</h2>");
    expect(html).toContain("Betalt i alt");
  });

  it("gavekort viser modtager og beløb", () => {
    const html = salgsmail(
      salgFraGavekort({
        giftCardNo: "GK-1",
        amountOre: 50000,
        purchaserName: "Ib",
        purchaserEmail: "ib@example.dk",
        purchaserPhone: "12345678",
        recipientEmail: "modtager@example.dk",
        message: "Tillykke",
        expiresAt: "2029-10-31T00:00:00Z",
      } as GiftCardRow)
    ).html;
    expect(html).toContain("Gavekort på 500 kr.");
    expect(html).toContain("modtager@example.dk");
    expect(html).toContain("12345678");
  });

  it("escaper kundens navn", () => {
    const html = salgsmail(
      salgFraBillet(billet({ customerName: "<script>x</script>" }))
    ).html;
    expect(html).not.toContain("<script>x</script>");
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
    expect(arg.html).toContain("Drikkevarer efter rabat");
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
