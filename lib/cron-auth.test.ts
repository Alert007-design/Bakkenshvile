import { describe, expect, it } from "vitest";
import { cronKanKoere, tjekCronAdgang } from "./cron-auth";

describe("tjekCronAdgang", () => {
  it("melder tydeligt, når CRON_SECRET mangler", () => {
    expect(tjekCronAdgang("Bearer x", {})).toBe("mangler-hemmelighed");
    expect(tjekCronAdgang(null, { CRON_SECRET: "  " })).toBe("mangler-hemmelighed");
  });

  it("afviser forkert eller manglende nøgle", () => {
    expect(tjekCronAdgang(null, { CRON_SECRET: "abc" })).toBe("forkert-noegle");
    expect(tjekCronAdgang("Bearer abd", { CRON_SECRET: "abc" })).toBe("forkert-noegle");
    expect(tjekCronAdgang("abc", { CRON_SECRET: "abc" })).toBe("forkert-noegle");
  });

  it("godkender den rigtige nøgle", () => {
    expect(tjekCronAdgang("Bearer abc", { CRON_SECRET: "abc" })).toBe("ok");
  });
});

describe("cronKanKoere", () => {
  it("er falsk uden CRON_SECRET og sand med", () => {
    expect(cronKanKoere({})).toBe(false);
    expect(cronKanKoere({ CRON_SECRET: "" })).toBe(false);
    expect(cronKanKoere({ CRON_SECRET: "abc" })).toBe(true);
  });
});
