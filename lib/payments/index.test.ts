import { describe, it, expect, afterEach } from "vitest";
import {
  assertVivaLiveAllowed,
  getConfiguredProviderName,
  getPaymentProvider,
} from "@/lib/payments";

// Gem og gendan de miljøvariabler testene rører ved.
const ENV_KEYS = ["PAYMENT_PROVIDER", "VIVA_ENV", "TABLE_ORDERING_LIVE"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getConfiguredProviderName", () => {
  it("vælger viva når PAYMENT_PROVIDER=viva", () => {
    process.env.PAYMENT_PROVIDER = "viva";
    expect(getConfiguredProviderName()).toBe("viva");
  });

  it("defaulter til stripe", () => {
    delete process.env.PAYMENT_PROVIDER;
    expect(getConfiguredProviderName()).toBe("stripe");
    process.env.PAYMENT_PROVIDER = "noget-andet";
    expect(getConfiguredProviderName()).toBe("stripe");
  });
});

describe("assertVivaLiveAllowed — fail-closed live-værn", () => {
  it("kaster ved VIVA_ENV=live når TABLE_ORDERING_LIVE er usat", () => {
    process.env.VIVA_ENV = "live";
    delete process.env.TABLE_ORDERING_LIVE;
    expect(() => assertVivaLiveAllowed()).toThrow();
  });

  it("tillader demo uanset live-flag", () => {
    process.env.VIVA_ENV = "demo";
    delete process.env.TABLE_ORDERING_LIVE;
    expect(() => assertVivaLiveAllowed()).not.toThrow();
  });

  it("tillader live når TABLE_ORDERING_LIVE=true", () => {
    process.env.VIVA_ENV = "live";
    process.env.TABLE_ORDERING_LIVE = "true";
    expect(() => assertVivaLiveAllowed()).not.toThrow();
  });
});

describe("getPaymentProvider — kan ikke omgå live-værnet", () => {
  it("kaster når Viva vælges i live uden flag", () => {
    process.env.PAYMENT_PROVIDER = "viva";
    process.env.VIVA_ENV = "live";
    delete process.env.TABLE_ORDERING_LIVE;
    expect(() => getPaymentProvider()).toThrow();
  });

  it("returnerer viva-provideren i demo", () => {
    process.env.PAYMENT_PROVIDER = "viva";
    process.env.VIVA_ENV = "demo";
    expect(getPaymentProvider().name).toBe("viva");
  });

  it("returnerer stripe-provideren som default", () => {
    delete process.env.PAYMENT_PROVIDER;
    expect(getPaymentProvider().name).toBe("stripe");
  });
});
