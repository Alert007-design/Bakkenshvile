// Tests for det fælles maildesign.
//
// To ting bevogtes her:
//  1) At hver mail faktisk indeholder de dynamiske værdier, modtageren skal
//     kunne handle på (bookingnummer, beløb, gavekortkode).
//  2) At brugerindtastet tekst bliver HTML-escapet, så et navn med <script>
//     aldrig kan lande råt i en mail.
//
// Desuden holdes de Outlook-sikre krav fast: kun tabeller, ingen flexbox/grid,
// ingen webfonte, ingen billeder.

import { describe, it, expect } from "vitest";
import { escapeHtml, mailLayout } from "@/lib/mail/layout";
import { ticketEmailHtml } from "@/lib/ticket-email";
import {
  giftCardRecipientEmailHtml,
  giftCardPurchaserEmailHtml,
} from "@/lib/gift-card-email";
import { orderEmailHtml } from "@/lib/order-email";

const ONDT_NAVN = '<script>alert("hej")</script>';

function billet(overstyr: Partial<Parameters<typeof ticketEmailHtml>[0]> = {}) {
  return ticketEmailHtml({
    customerName: "Morten Messerschmidt",
    bookingNo: "BH-31608747",
    showTitle: "150 års jubilæums show 2027",
    showDateIso: "2027-05-20",
    showTime: "20:00",
    seats: "B (10. række) × 1",
    isJubilee: true,
    lineItems: [
      {
        description: "Billet: B (10. række) – tor 20. maj kl. 20:00",
        quantity: 1,
        amountSubtotalOre: 31900,
      },
      { description: "Danskvand med citrus", quantity: 1, amountSubtotalOre: 5000 },
    ],
    subtotalKr: 369,
    discountKr: 5,
    totalKr: 364,
    discountLabel: "Onlinerabat, 10 % på drikkevarer",
    ...overstyr,
  });
}

describe("escapeHtml", () => {
  it("escaper de fem farlige tegn", () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;"
    );
  });

  it("tåler tom tekst og null", () => {
    expect(escapeHtml("")).toBe("");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("det fælles mail-layout", () => {
  const html = mailLayout({
    title: "En test",
    preheader: "Skjult forhåndstekst",
    indhold: "<p>Indhold</p>",
  });

  it("er et helt HTML-dokument med dansk sprog", () => {
    expect(html.trimStart().startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<html lang="da">');
  });

  it("bærer sidehoved, guldstribe og sidefod", () => {
    expect(html).toContain("På Dyrehavsbakken siden 1877");
    expect(html).toContain("Bakkens Hvile");
    expect(html).toContain("Dyrehavsbakken 38, 2930 Klampenborg");
    expect(html).toContain("kontor@bakkenshvile.dk");
  });

  it("har en skjult preheader med den dynamiske tekst", () => {
    expect(html).toContain("Skjult forhåndstekst");
    expect(html).toMatch(/display:none;max-height:0/);
  });

  it("escaper titel og preheader", () => {
    const farlig = mailLayout({
      title: ONDT_NAVN,
      preheader: ONDT_NAVN,
      indhold: "<p>ok</p>",
    });
    expect(farlig).not.toContain("<script>");
    expect(farlig).toContain("&lt;script&gt;");
  });
});

describe("Outlook-sikkerhed på tværs af alle mails", () => {
  const alle: Array<[string, string]> = [
    ["billet", billet()],
    [
      "gavekort til modtager",
      giftCardRecipientEmailHtml({
        code: "BH-TU3T-YN3N",
        amountKr: 100,
        expiresIso: "2029-09-20T00:00:00.000Z",
        purchaserName: "Morten Messerschmidt",
        message: null,
      }),
    ],
    [
      "gavekortkvittering",
      giftCardPurchaserEmailHtml({
        giftCardNo: "GK-30728637",
        amountKr: 100,
        recipientEmail: "modtager@example.com",
        expiresIso: "2029-09-20T00:00:00.000Z",
      }),
    ],
    [
      "ekstra bestilling",
      orderEmailHtml({
        heading: "Tak for din ekstra bestilling, Morten!",
        bookingNo: "BH-31608747",
        lineItems: [
          { description: "Danskvand", quantity: 2, amountSubtotalOre: 10000 },
        ],
        discountKr: 10,
        totalLabel: "Betalt nu",
        total: "90 kr.",
        footerNote: "Vi glæder os til at se dig.",
      }),
    ],
  ];

  for (const [navn, html] of alle) {
    it(`${navn}: bruger kun tabeller og Georgia`, () => {
      expect(html).toContain('role="presentation"');
      expect(html).toContain("Georgia");
      expect(html).not.toMatch(/display:\s*flex/);
      expect(html).not.toMatch(/display:\s*grid/);
      expect(html).not.toMatch(/border-radius/);
      expect(html).not.toMatch(/<img\b/);
      expect(html).not.toMatch(/fonts\.googleapis|@font-face|Fraunces/);
    });
  }
});

describe("billetmail", () => {
  it("indeholder bookingnummer, forestilling, pladser og totalen", () => {
    const html = billet();
    expect(html).toContain("BH-31608747");
    expect(html).toContain("150 års jubilæums show 2027");
    expect(html).toContain("B (10. række) × 1");
    expect(html).toContain("364 kr.");
    expect(html).toContain("Danskvand med citrus");
  });

  it("viser datoen opdelt i ugedag, dag og måned", () => {
    const html = billet();
    expect(html).toContain("torsdag");
    expect(html).toContain("20.");
    expect(html).toContain("maj 2027");
    expect(html).toContain("kl. 20:00");
  });

  it("har bookingnummeret i den skjulte preheader", () => {
    expect(billet()).toMatch(
      /display:none;max-height:0[^>]*>[^<]*BH-31608747/
    );
  });

  it("escaper gæstens navn", () => {
    const html = billet({ customerName: ONDT_NAVN });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escaper forestillingens titel og pladser", () => {
    const html = billet({ showTitle: ONDT_NAVN, seats: ONDT_NAVN });
    expect(html).not.toContain("<script>");
  });

  it("escaper varelinjernes tekst", () => {
    const html = billet({
      lineItems: [
        { description: ONDT_NAVN, quantity: 1, amountSubtotalOre: 100 },
      ],
    });
    expect(html).not.toContain("<script>");
  });

  it("viser Normalpris og rabatlinjen, når der er rabat", () => {
    const html = billet();
    expect(html).toContain("Normalpris");
    expect(html).toContain("369 kr.");
    expect(html).toContain("Onlinerabat, 10 % på drikkevarer");
  });

  it("skjuler Normalpris og rabatlinjen, når der ingen rabat er", () => {
    const html = billet({ discountKr: 0, subtotalKr: 364 });
    expect(html).not.toContain("Normalpris");
    expect(html).not.toContain("Onlinerabat");
  });

  it("viser jubilæumsbåndet for en jubilæumsforestilling", () => {
    expect(billet()).toContain("Jubilæumsforestilling 2027");
  });

  it("skjuler jubilæumsbåndet for alle andre forestillinger", () => {
    expect(billet({ isJubilee: false })).not.toContain("Jubilæumsforestilling 2027");
  });

  it("gengiver den juridiske tekst ordret", () => {
    expect(billet()).toContain(
      "Bliver du selv forhindret, kan billetten ikke byttes eller refunderes, men den kan i stedet overdrages til tredjemand. Hvis en forestilling aflyses, tilbagebetales billetprisen og prisen for ikke-leverede tilvalg."
    );
    expect(billet()).toContain(
      "Alle priser er inklusive 25 % moms. Momsbeløbet svarer til 20 % af den samlede pris inklusive moms."
    );
  });

  it("tåler en booking uden dato og uden navn", () => {
    const html = billet({ customerName: "", showDateIso: "", showTime: "" });
    expect(html).toContain("BH-31608747");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });
});

describe("gavekort til modtageren", () => {
  const basis = {
    code: "BH-TU3T-YN3N",
    amountKr: 100,
    expiresIso: "2029-09-20T00:00:00.000Z",
    purchaserName: "Morten Messerschmidt",
  };

  it("indeholder koden, beløbet og udløbsdatoen", () => {
    const html = giftCardRecipientEmailHtml({ ...basis, message: null });
    expect(html).toContain("BH-TU3T-YN3N");
    expect(html).toContain("100 kr.");
    expect(html).toContain("20. september 2029");
  });

  it("har beløb og afsender i den skjulte preheader", () => {
    const html = giftCardRecipientEmailHtml({ ...basis, message: null });
    expect(html).toMatch(
      /display:none;max-height:0[^>]*>[^<]*100 kr[^<]*Morten Messerschmidt/
    );
  });

  it("viser den personlige hilsen, når der er en", () => {
    const html = giftCardRecipientEmailHtml({
      ...basis,
      message: "God fornøjelse!",
    });
    expect(html).toContain("God fornøjelse!");
    expect(html).toContain("Morten Messerschmidt");
  });

  it("falder tilbage på en neutral hilsen uden besked", () => {
    const html = giftCardRecipientEmailHtml({ ...basis, message: null });
    expect(html).toContain("En hilsen fra Morten Messerschmidt");
  });

  it("escaper både hilsen og købers navn", () => {
    const html = giftCardRecipientEmailHtml({
      ...basis,
      purchaserName: ONDT_NAVN,
      message: ONDT_NAVN,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("kvittering for gavekort", () => {
  const html = giftCardPurchaserEmailHtml({
    giftCardNo: "GK-30728637",
    amountKr: 100,
    recipientEmail: "modtager@example.com",
    expiresIso: "2029-09-20T00:00:00.000Z",
  });

  it("indeholder ordrenummer, beløb, modtager og udløbsdato", () => {
    expect(html).toContain("GK-30728637");
    expect(html).toContain("100 kr.");
    expect(html).toContain("modtager@example.com");
    expect(html).toContain("20. september 2029");
  });

  it("har ordrenummer og beløb i den skjulte preheader", () => {
    expect(html).toMatch(
      /display:none;max-height:0[^>]*>[^<]*GK-30728637[^<]*100 kr/
    );
  });

  it("gengiver momsteksten ordret", () => {
    expect(html).toContain("Alle priser er inklusive 25 % moms.");
  });

  it("escaper modtagerens e-mail", () => {
    const farlig = giftCardPurchaserEmailHtml({
      giftCardNo: "GK-1",
      amountKr: 100,
      recipientEmail: ONDT_NAVN,
      expiresIso: "2029-09-20T00:00:00.000Z",
    });
    expect(farlig).not.toContain("<script>");
  });
});

describe("mail om ekstra bestilling", () => {
  function ekstra(overstyr: Partial<Parameters<typeof orderEmailHtml>[0]> = {}) {
    return orderEmailHtml({
      heading: "Tak for din ekstra bestilling, Morten!",
      bookingNo: "BH-31608747",
      lineItems: [
        { description: "Danskvand", quantity: 2, amountSubtotalOre: 10000 },
      ],
      discountKr: 10,
      totalLabel: "Betalt nu",
      total: "90 kr.",
      grandTotal: "454 kr.",
      footerNote: "Vi glæder os til at se dig.",
      ...overstyr,
    });
  }

  it("indeholder bookingnummer, varelinje og begge totaler", () => {
    const html = ekstra();
    expect(html).toContain("BH-31608747");
    expect(html).toContain("Danskvand");
    expect(html).toContain("Betalt nu");
    expect(html).toContain("90 kr.");
    expect(html).toContain("454 kr.");
  });

  it("viser rabatlinjen kun når der er rabat", () => {
    expect(ekstra()).toContain("Onlinerabat");
    expect(ekstra({ discountKr: 0 })).not.toContain("Onlinerabat");
  });

  it("escaper overskriften, som bærer gæstens navn", () => {
    const html = ekstra({ heading: ONDT_NAVN });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
