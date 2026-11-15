// Tests for Meta-kaldene, loggen og selve kørslen af stories.
//
// Det vigtigste, der bevogtes:
//  - nøglen står aldrig i en fejlbesked
//  - en story lægges højst op én gang pr. dag, tidspunkt og platform,
//    også hvis cron kører to gange, og også efter en fejl
//  - i kladde, eller når skabelonen ikke er godkendt, kaldes Meta aldrig
//  - en fejl på Facebook stopper ikke Instagram

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type Queryable } from "@/lib/db";
import { opretMeta, MetaFejl } from "./meta";
import { hentLog, reserver, afslut } from "./log";
import { koerStories, laesIndstillinger, type KoerselDeps } from "./koersel";

const NOEGLE = "EAAhemmelig123";

function svar(status: number, data: unknown) {
  return { ok: status < 400, status, json: async () => data } as Response;
}

describe("meta", () => {
  it("lægger en Facebook-story op i to trin", async () => {
    const kald: string[] = [];
    const hent = vi.fn(async (url: string) => {
      kald.push(url);
      return url.endsWith("/photos") ? svar(200, { id: "foto1" }) : svar(200, { post_id: "story1" });
    });
    const meta = opretMeta({ fetch: hent as never });
    expect(await meta.facebookStory("side", NOEGLE, "https://x/b.jpg")).toEqual({ id: "story1" });
    expect(kald[0]).toContain("/side/photos");
    expect(kald[1]).toContain("/side/photo_stories");
  });

  it("venter på Instagram og udgiver", async () => {
    let status = 0;
    const hent = vi.fn(async (url: string) => {
      if (url.endsWith("/media")) return svar(200, { id: "c1" });
      if (url.includes("status_code")) return svar(200, { status_code: status++ ? "FINISHED" : "IN_PROGRESS" });
      return svar(200, { id: "ig1" });
    });
    const meta = opretMeta({ fetch: hent as never, vent: async () => {} });
    expect(await meta.instagramStory("ig", NOEGLE, "https://x/b.jpg")).toEqual({ id: "ig1" });
  });

  it("skjuler nøglen i fejlbeskeder og kender en død nøgle", async () => {
    const hent = vi.fn(async () =>
      svar(400, { error: { code: 190, message: `Token ${NOEGLE} er udløbet` } })
    );
    const meta = opretMeta({ fetch: hent as never });
    const fejl = await meta.facebookStory("side", NOEGLE, "https://x").catch((e) => e);
    expect(fejl).toBeInstanceOf(MetaFejl);
    expect(fejl.art).toBe("noegle_doed");
    expect(String(fejl.message)).not.toContain(NOEGLE);
  });

  it("nægter at kalde uden nøgle", async () => {
    const hent = vi.fn();
    const meta = opretMeta({ fetch: hent as never });
    await expect(meta.facebookStory("side", "", "https://x")).rejects.toThrow(/mangler/);
    expect(hent).not.toHaveBeenCalled();
  });
});

describe("log og kørsel", () => {
  let db: Queryable;

  beforeAll(async () => {
    const pg = new PGlite();
    db = { query: (t, p) => pg.query(t, p as never[]) as never };
    await applyMigrations(db);
  });

  beforeEach(async () => {
    await db.query("DELETE FROM story_log");
  });

  it("reserverer kun én gang pr. dag, tidspunkt og platform", async () => {
    expect(await reserver(db, "2026-11-16", "morgen", "facebook", "nedtaelling")).toBe(true);
    expect(await reserver(db, "2026-11-16", "morgen", "facebook", "nedtaelling")).toBe(false);
    expect(await reserver(db, "2026-11-16", "morgen", "instagram", "nedtaelling")).toBe(true);
  });

  it("gemmer resultatet og viser det i loggen", async () => {
    await reserver(db, "2026-11-16", "morgen", "facebook", "nedtaelling");
    await afslut(db, "2026-11-16", "morgen", "facebook", "lagt", "id1", null);
    const log = await hentLog(db, 5);
    expect(log[0]).toMatchObject({ dato: "2026-11-16", status: "lagt", meta_id: "id1" });
  });

  function deps(over: Partial<KoerselDeps> = {}): KoerselDeps {
    return {
      db,
      now: new Date("2026-11-16T07:25:00Z"), // kl. 8.25 dansk tid
      hentShows: async () => [{ date: "2027-05-10", time: "20:00", tilbage: 300, soldOut: false }],
      meta: {
        facebookStory: vi.fn(async () => ({ id: "fb1" })),
        instagramStory: vi.fn(async () => ({ id: "ig1" })),
      },
      indstillinger: {
        tilstand: "live",
        godkendt: ["nedtaelling", "gavekort", "billetter", "pladser", "i-aften"],
        noegle: NOEGLE,
        sideId: "side",
        instagramId: "ig",
      },
      billedUrl: (slot, dato) => `https://site/stories/billede/${slot}/${dato}`,
      ...over,
    };
  }

  it("lægger morgenens story op på begge platforme i live", async () => {
    const d = deps();
    const r = await koerStories(d);
    expect(r.slot).toBe("morgen");
    expect(d.meta.facebookStory).toHaveBeenCalledWith("side", NOEGLE, expect.stringContaining("/morgen/2026-11-16"));
    expect(d.meta.instagramStory).toHaveBeenCalledTimes(1);
    expect((await hentLog(db, 5)).map((l) => l.status)).toEqual(["lagt", "lagt"]);
  });

  it("lægger ikke op to gange, hvis cron kører igen", async () => {
    const d = deps();
    await koerStories(d);
    await koerStories(d);
    expect(d.meta.facebookStory).toHaveBeenCalledTimes(1);
  });

  it("gør intet uden for de to tidspunkter", async () => {
    const d = deps({ now: new Date("2026-11-16T11:25:00Z") });
    expect((await koerStories(d)).slot).toBeNull();
    expect(d.meta.facebookStory).not.toHaveBeenCalled();
  });

  it("kalder aldrig Meta i kladde", async () => {
    const d = deps();
    d.indstillinger.tilstand = "kladde";
    await koerStories(d);
    expect(d.meta.facebookStory).not.toHaveBeenCalled();
    expect((await hentLog(db, 5)).map((l) => l.status)).toEqual(["kladde", "kladde"]);
  });

  it("kalder ikke Meta for en skabelon, der ikke er godkendt", async () => {
    const d = deps();
    d.indstillinger.godkendt = ["gavekort"];
    await koerStories(d);
    expect(d.meta.facebookStory).not.toHaveBeenCalled();
  });

  it("gør intet, når stories er slået fra", async () => {
    const d = deps();
    d.indstillinger.tilstand = "fra";
    await koerStories(d);
    expect(await hentLog(db, 5)).toEqual([]);
  });

  it("logger en fejl på Facebook og fortsætter med Instagram, uden at prøve igen", async () => {
    const d = deps();
    (d.meta.facebookStory as ReturnType<typeof vi.fn>).mockRejectedValue(new MetaFejl("Meta svarede 500", "uvist"));
    await koerStories(d);
    await koerStories(d);
    expect(d.meta.facebookStory).toHaveBeenCalledTimes(1);
    expect(d.meta.instagramStory).toHaveBeenCalledTimes(1);
    const log = await hentLog(db, 5);
    expect(log.find((l) => l.platform === "facebook")).toMatchObject({ status: "fejl" });
  });

  it("logger en fejl, hvis forestillingerne ikke kan hentes", async () => {
    const d = deps({ hentShows: async () => { throw new Error("Airtable nede"); } });
    const r = await koerStories(d);
    expect(r.fejl).toMatch(/forestillinger/);
    expect(d.meta.facebookStory).not.toHaveBeenCalled();
    expect((await hentLog(db, 5)).map((l) => l.status)).toEqual(["fejl", "fejl"]);
  });

  it("læser indstillinger sikkert, med kladde som standard", () => {
    expect(laesIndstillinger({}).tilstand).toBe("kladde");
    expect(laesIndstillinger({ STORIES_TILSTAND: "LIVE" }).tilstand).toBe("live");
    expect(laesIndstillinger({ STORIES_TILSTAND: "noget" }).tilstand).toBe("kladde");
    expect(laesIndstillinger({ STORIES_GODKENDT: " gavekort, pladser ,x" }).godkendt).toEqual(["gavekort", "pladser"]);
  });
});
