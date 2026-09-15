import { describe, it, expect, afterEach } from "vitest";
import {
  assertVivaLiveAllowed,
  getConfiguredProviderName,
  getPaymentProvider,
} from "@/lib/payments";

// Gem og gendan de miljøvariabler testene rører ved.
const ENV_KEYS = [
  "PAYMENT_PROVIDER",
  "VIVA_ENV",
  "TABLE_ORDERING_LIVE",
  "TICKETS_LIVE",
  "GAVEKORT_LIVE",
] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getConfiguredProviderName", () => {
  it("er altid viva (eneste udbyder)", () => {
    process.env.PAYMENT_PROVIDER = "viva";
    expect(getConfiguredProviderName()).toBe("viva");
    delete process.env.PAYMENT_PROVIDER;
    expect(getConfiguredProviderName()).toBe("viva");
  });
});

describe("assertVivaLiveAllowed — fail-closed live-værn pr. flow", () => {
  it("tillader demo uanset flag (alle scopes)", () => {
    process.env.VIVA_ENV = "demo";
    delete process.env.TABLE_ORDERING_LIVE;
    delete process.env.TICKETS_LIVE;
    delete process.env.GAVEKORT_LIVE;
    expect(() => assertVivaLiveAllowed("tickets")).not.toThrow();
    expect(() => assertVivaLiveAllowed("table")).not.toThrow();
    expect(() => assertVivaLiveAllowed("gavekort")).not.toThrow();
  });

  it("tickets: kaster i live uden TICKETS_LIVE, tillader med", () => {
    process.env.VIVA_ENV = "live";
    delete process.env.TICKETS_LIVE;
    expect(() => assertVivaLiveAllowed("tickets")).toThrow();
    process.env.TICKETS_LIVE = "true";
    expect(() => assertVivaLiveAllowed("tickets")).not.toThrow();
  });

  it("table: kaster i live uden TABLE_ORDERING_LIVE, tillader med", () => {
    process.env.VIVA_ENV = "live";
    delete process.env.TABLE_ORDERING_LIVE;
    expect(() => assertVivaLiveAllowed("table")).toThrow();
    process.env.TABLE_ORDERING_LIVE = "true";
    expect(() => assertVivaLiveAllowed("table")).not.toThrow();
  });

  it("gavekort: kaster i live uden GAVEKORT_LIVE, tillader med", () => {
    process.env.VIVA_ENV = "live";
    delete process.env.GAVEKORT_LIVE;
    expect(() => assertVivaLiveAllowed("gavekort")).toThrow();
    process.env.GAVEKORT_LIVE = "true";
    expect(() => assertVivaLiveAllowed("gavekort")).not.toThrow();
  });

  it("flowene er AFKOBLEDE: bord-flaget åbner ikke for billetter, og omvendt", () => {
    process.env.VIVA_ENV = "live";
    // Kun bordbestillingen er live → billetter må stadig ikke gå live.
    process.env.TABLE_ORDERING_LIVE = "true";
    delete process.env.TICKETS_LIVE;
    expect(() => assertVivaLiveAllowed("table")).not.toThrow();
    expect(() => assertVivaLiveAllowed("tickets")).toThrow();

    // Kun billetter er live → bordbestillingen må stadig ikke gå live.
    process.env.TICKETS_LIVE = "true";
    delete process.env.TABLE_ORDERING_LIVE;
    expect(() => assertVivaLiveAllowed("tickets")).not.toThrow();
    expect(() => assertVivaLiveAllowed("table")).toThrow();
  });

  // Husets aktuelle situation: gavekortet skal kunne sælges live, mens
  // billetsalget endnu ikke er gået live. Uden det egne flag ville gavekortet
  // arve TICKETS_LIVE og enten være spærret eller tvinge billetter live.
  it("gavekort kan gå live ALENE — billet og bord forbliver spærret", () => {
    process.env.VIVA_ENV = "live";
    process.env.GAVEKORT_LIVE = "true";
    delete process.env.TICKETS_LIVE;
    delete process.env.TABLE_ORDERING_LIVE;
    expect(() => assertVivaLiveAllowed("gavekort")).not.toThrow();
    expect(() => assertVivaLiveAllowed("tickets")).toThrow();
    expect(() => assertVivaLiveAllowed("table")).toThrow();
  });

  it("TICKETS_LIVE åbner IKKE længere for gavekort", () => {
    process.env.VIVA_ENV = "live";
    process.env.TICKETS_LIVE = "true";
    delete process.env.GAVEKORT_LIVE;
    expect(() => assertVivaLiveAllowed("tickets")).not.toThrow();
    expect(() => assertVivaLiveAllowed("gavekort")).toThrow();
  });
});

describe("getPaymentProvider — kan ikke omgå live-værnet", () => {
  it("kaster når Viva vælges i live uden flowets flag", () => {
    process.env.PAYMENT_PROVIDER = "viva";
    process.env.VIVA_ENV = "live";
    delete process.env.TICKETS_LIVE;
    expect(() => getPaymentProvider("tickets")).toThrow();
  });

  it("returnerer viva-provideren i demo", () => {
    process.env.PAYMENT_PROVIDER = "viva";
    process.env.VIVA_ENV = "demo";
    expect(getPaymentProvider("tickets").name).toBe("viva");
    expect(getPaymentProvider("table").name).toBe("viva");
  });

  it("returnerer viva-provideren uanset PAYMENT_PROVIDER", () => {
    delete process.env.PAYMENT_PROVIDER;
    process.env.VIVA_ENV = "demo";
    expect(getPaymentProvider("tickets").name).toBe("viva");
  });
});
