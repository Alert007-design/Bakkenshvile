import { describe, it, expect } from "vitest";
import { routeByTag, bookingIdFromTags } from "@/lib/viva-webhook";

describe("routeByTag — dirigering på første tag", () => {
  it("billet / genbestil / bordbestilling rammer hver sin håndtering", () => {
    expect(routeByTag(["billet", "recA"])).toBe("billet");
    expect(routeByTag(["genbestil", "recB"])).toBe("genbestil");
    expect(routeByTag(["bordbestilling", "evt1"])).toBe("bordbestilling");
  });

  it("ukendt eller manglende tag → null (ingen tilstandsændring)", () => {
    expect(routeByTag(["noget-andet"])).toBeNull();
    expect(routeByTag([])).toBeNull();
    expect(routeByTag(undefined)).toBeNull();
    expect(routeByTag(null)).toBeNull();
    // Kun FØRSTE tag dirigerer — et gyldigt ord længere inde tæller ikke.
    expect(routeByTag(["x", "billet"])).toBeNull();
  });
});

describe("bookingIdFromTags", () => {
  it("læser tags[1] som bookingId", () => {
    expect(bookingIdFromTags(["billet", "recABC"])).toBe("recABC");
  });
  it("returnerer null uden bookingId", () => {
    expect(bookingIdFromTags(["billet"])).toBeNull();
    expect(bookingIdFromTags([])).toBeNull();
    expect(bookingIdFromTags(undefined)).toBeNull();
  });
});
