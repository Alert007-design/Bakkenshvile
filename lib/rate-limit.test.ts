import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, __clearRateLimits } from "@/lib/rate-limit";

beforeEach(() => __clearRateLimits());

describe("rateLimit", () => {
  it("tillader op til grænsen og blokerer derefter", () => {
    let now = 1000;
    const clock = () => now;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("k", 3, 1000, clock).ok).toBe(true);
    }
    const blocked = rateLimit("k", 3, 1000, clock);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("frigiver plads når vinduet er passeret", () => {
    let now = 1000;
    const clock = () => now;
    rateLimit("k", 1, 1000, clock);
    expect(rateLimit("k", 1, 1000, clock).ok).toBe(false);
    now = 2500; // over 1000 ms senere
    expect(rateLimit("k", 1, 1000, clock).ok).toBe(true);
  });

  it("holder nøgler adskilt", () => {
    const clock = () => 1000;
    expect(rateLimit("a", 1, 1000, clock).ok).toBe(true);
    expect(rateLimit("b", 1, 1000, clock).ok).toBe(true);
    expect(rateLimit("a", 1, 1000, clock).ok).toBe(false);
  });
});
