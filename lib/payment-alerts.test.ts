import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMail = vi.fn();
vi.mock("@/lib/resend", () => ({
  sendMail: (...args: unknown[]) => sendMail(...args),
  EMAIL_REPLY_TO: "kontor@bakkenshvile.dk",
}));

import {
  advarOmBeloebsfejl,
  advarOmManglendeBekraeftelse,
  beloebsfejlMail,
} from "@/lib/payment-alerts";

beforeEach(() => {
  sendMail.mockReset();
});

describe("beloebsfejlMail", () => {
  const input = {
    type: "Billet" as const,
    reference: "BH-K7M2Q9XR",
    kundeNavn: "Hanne Hansen",
    kundeEmail: "hanne@example.dk",
    forventetOre: 85800,
    betaltOre: 42900,
    valuta: "DKK",
    transaktionsId: "abc-123",
  };

  it("har bookingnummeret i emnet", () => {
    const m = beloebsfejlMail(input);
    expect(m.subject).toContain("BH-K7M2Q9XR");
    expect(m.subject.toLowerCase()).toContain("betaling");
  });

  it("indeholder kunde, beløb og Vivas transaktionsnummer", () => {
    const { html } = beloebsfejlMail(input);
    expect(html).toContain("Hanne Hansen");
    expect(html).toContain("hanne@example.dk");
    expect(html).toContain("858");
    expect(html).toContain("429");
    expect(html).toContain("abc-123");
  });

  it("escaper felter, som kunden selv har skrevet", () => {
    const { html } = beloebsfejlMail({
      ...input,
      kundeNavn: '<script>alert("x")</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("virker uden kundeoplysninger (bordbestilling)", () => {
    const m = beloebsfejlMail({
      type: "Bordbestilling",
      reference: "Bord 23",
      forventetOre: 19800,
      betaltOre: 9900,
      valuta: "DKK",
      transaktionsId: "t-1",
    });
    expect(m.subject).toContain("Bord 23");
    expect(m.html).toContain("t-1");
  });
});

describe("advarOmBeloebsfejl", () => {
  it("sender mailen til kontoret", async () => {
    sendMail.mockResolvedValue(undefined);
    await advarOmBeloebsfejl({
      type: "Gavekort",
      reference: "GK-1",
      forventetOre: 50000,
      betaltOre: 10000,
      valuta: "DKK",
      transaktionsId: "t-2",
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe("kontor@bakkenshvile.dk");
  });

  it("kaster aldrig, heller ikke når mailen fejler", async () => {
    sendMail.mockRejectedValue(new Error("Resend nede"));
    await expect(
      advarOmBeloebsfejl({
        type: "Billet",
        reference: "BH-X",
        forventetOre: 1,
        betaltOre: 2,
        valuta: "DKK",
        transaktionsId: "t",
      })
    ).resolves.toBeUndefined();
  });
});

describe("advarOmManglendeBekraeftelse", () => {
  it("sender en mail til kontoret med bookingnummer og kundens mail", async () => {
    sendMail.mockResolvedValue(undefined);
    await advarOmManglendeBekraeftelse({
      bookingNo: "BH-K7M2Q9XR",
      kundeNavn: "Hanne",
      kundeEmail: "hanne@example.dk",
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe("kontor@bakkenshvile.dk");
    expect(arg.subject).toContain("BH-K7M2Q9XR");
    expect(arg.html).toContain("hanne@example.dk");
  });

  it("kaster aldrig", async () => {
    sendMail.mockRejectedValue(new Error("nede"));
    await expect(
      advarOmManglendeBekraeftelse({ bookingNo: "BH-X" })
    ).resolves.toBeUndefined();
  });
});
