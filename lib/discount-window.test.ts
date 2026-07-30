import { describe, it, expect } from "vitest";
import { copenhagenNoon, onlineDiscountActive } from "@/lib/genbestil";

// Rabatgrænsen er kl. 12.00 Europe/Copenhagen på forestillingsdagen og skal
// beregnes med korrekt sommer-/vintertid — uafhængigt af serverens/browserens
// egen tidszone. Vi verificerer grænsen præcist på begge sider af kl. 12.00.

describe("copenhagenNoon — kl. 12.00 dansk tid i UTC", () => {
  it("sommertid (CEST, +2): 12.00 CPH = 10.00 UTC", () => {
    // 10. maj 2027 er sommertid i Danmark.
    expect(copenhagenNoon("2027-05-10")!.toISOString()).toBe(
      "2027-05-10T10:00:00.000Z"
    );
  });

  it("vintertid (CET, +1): 12.00 CPH = 11.00 UTC", () => {
    // 15. januar 2027 er vintertid i Danmark.
    expect(copenhagenNoon("2027-01-15")!.toISOString()).toBe(
      "2027-01-15T11:00:00.000Z"
    );
  });

  it("ugyldig dato → null", () => {
    expect(copenhagenNoon("ikke-en-dato")).toBeNull();
    expect(copenhagenNoon("")).toBeNull();
  });
});

describe("onlineDiscountActive — grænsen omkring kl. 12.00", () => {
  it("sommertid: aktiv lige før, inaktiv fra kl. 12.00", () => {
    const iso = "2027-05-10";
    // 09:59:59 UTC = 11:59:59 CPH → stadig rabat.
    expect(onlineDiscountActive(iso, new Date("2027-05-10T09:59:59Z"))).toBe(true);
    // 10:00:00 UTC = 12:00:00 CPH → rabatten ophører.
    expect(onlineDiscountActive(iso, new Date("2027-05-10T10:00:00Z"))).toBe(false);
    // Efter showtidspunkt samme dag → ingen rabat.
    expect(onlineDiscountActive(iso, new Date("2027-05-10T18:00:00Z"))).toBe(false);
  });

  it("vintertid: aktiv lige før, inaktiv fra kl. 12.00", () => {
    const iso = "2027-01-15";
    // 10:59:59 UTC = 11:59:59 CPH → stadig rabat.
    expect(onlineDiscountActive(iso, new Date("2027-01-15T10:59:59Z"))).toBe(true);
    // 11:00:00 UTC = 12:00:00 CPH → rabatten ophører.
    expect(onlineDiscountActive(iso, new Date("2027-01-15T11:00:00Z"))).toBe(false);
  });

  it("dage før forestillingen → rabat aktiv", () => {
    expect(onlineDiscountActive("2027-05-10", new Date("2027-05-01T23:00:00Z"))).toBe(
      true
    );
  });

  it("ukendt dato → ingen rabat", () => {
    expect(onlineDiscountActive("", new Date("2027-05-10T08:00:00Z"))).toBe(false);
  });
});
