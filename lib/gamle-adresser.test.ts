import { describe, it, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require("../next.config.js");

type R = { source: string; destination: string; permanent: boolean; has?: unknown };

describe("gamle WordPress-adresser fra Search Console (404)", () => {
  it.each([
    ["/om", "/historie"],
    ["/da", "/"],
    ["/da/kontakt-bakkens-hvile", "/praktisk"],
  ])("%s sender varigt videre til %s", async (fra, til) => {
    const liste: R[] = await nextConfig.redirects();
    const r = liste.find((x) => x.source === fra && !x.has);
    expect(r).toBeDefined();
    expect(r!.destination).toBe(til);
    expect(r!.permanent).toBe(true);
  });
});
