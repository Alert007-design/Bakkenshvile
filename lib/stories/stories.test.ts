// Tests for Meta-kaldene, loggen og selve kørslen af stories.
//
// Det vigtigste, der bevogtes:
//  - Instagram får tid til at tegne billedet; er beholderen stadig ikke færdig,
//    gemmes den som "venter" (ikke "fejl") og udgives ved næste timekørsel
//  - kun ERROR/EXPIRED er en egentlig fejl
//  - en Instagram-story udgives aldrig to gange, heller ikke ved samtidige
//    kørsler eller når Metas svar på udgivelsen gik tabt
//  - nøglen står aldrig i en fejlbesked
//  - en story lægges højst op én gang pr. dag, tidspunkt og platform,
//    også hvis cron kører to gange, og også efter en fejl
//  - i kladde, eller når skabelonen ikke er godkendt, kaldes Meta aldrig
//  - en fejl på Facebook stopper ikke Instagram

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, runSqlScript, type Queryable } from "@/lib/db";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { opretMeta, MetaFejl, type Meta } from "./meta";
import { hentLog, hentVentende, overtag, reserver, afslut } from "./log";
import { koerStories, laesIndstillinger, loglinjer, type KoerselDeps } from "./koersel";

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

  // Instagram: status-svar i rækkefølge, og alt andet svares som udgivelse.
  function igHent(statuser: (string | "NETFEJL")[], opts: { publish?: () => Response | Promise<Response> } = {}) {
    let n = 0;
    const kald: string[] = [];
    const hent = vi.fn(async (url: string) => {
      kald.push(url);
      if (url.endsWith("/media")) return svar(200, { id: "c1" });
      if (url.includes("status_code")) {
        const st = statuser[Math.min(n++, statuser.length - 1)];
        if (st === "NETFEJL") throw new Error("netværk");
        return svar(200, { status_code: st });
      }
      if (url.endsWith("/media_publish")) return opts.publish ? opts.publish() : svar(200, { id: "ig1" });
      return svar(200, {});
    });
    return { hent, kald, antalStatus: () => kald.filter((u) => u.includes("status_code")).length, udgivet: () => kald.filter((u) => u.endsWith("/media_publish")).length };
  }

  it("Instagram: venter længere, med stigende pauser på i alt 35 sekunder, og melder så 'venter'", async () => {
    const ig = igHent(["IN_PROGRESS"]);
    const pauser: number[] = [];
    const meta = opretMeta({ fetch: ig.hent as never, vent: async (ms) => { pauser.push(ms); } });
    expect(await meta.instagramStory("ig", NOEGLE, "https://x/b.jpg")).toEqual({ venter: "c1" });
    expect(pauser).toEqual([2000, 3000, 4000, 5000, 6000, 7000, 8000]);
    expect(pauser.reduce((a, b) => a + b, 0)).toBe(35_000);
    expect(pauser.every((p, i) => i === 0 || p > pauser[i - 1])).toBe(true);
    expect(ig.antalStatus()).toBe(8);
    expect(ig.udgivet()).toBe(0);
  });

  it("Instagram: udgiver, så snart beholderen er færdig (efter tre tjek)", async () => {
    const ig = igHent(["IN_PROGRESS", "IN_PROGRESS", "FINISHED"]);
    const pauser: number[] = [];
    const meta = opretMeta({ fetch: ig.hent as never, vent: async (ms) => { pauser.push(ms); } });
    expect(await meta.instagramStory("ig", NOEGLE, "https://x/b.jpg")).toEqual({ id: "ig1" });
    expect(pauser).toEqual([2000, 3000]);
    expect(ig.udgivet()).toBe(1);
  });

  it.each(["ERROR", "EXPIRED"])("Instagram: %s er en egentlig fejl, med beholder-id'et på fejlen", async (kode) => {
    const ig = igHent([kode]);
    const meta = opretMeta({ fetch: ig.hent as never, vent: async () => {} });
    const fejl = await meta.instagramStory("ig", NOEGLE, "https://x/b.jpg").catch((e) => e);
    expect(fejl).toBeInstanceOf(MetaFejl);
    expect(fejl.art).toBe("afvist");
    expect(fejl.message).toContain(kode);
    expect(fejl.creationId).toBe("c1");
    expect(ig.udgivet()).toBe(0);
  });

  it("Instagram: et netværksbrud under ventetiden er ikke en fejl, men 'venter'", async () => {
    const ig = igHent(["IN_PROGRESS", "NETFEJL"]);
    const meta = opretMeta({ fetch: ig.hent as never, vent: async () => {} });
    expect(await meta.instagramStory("ig", NOEGLE, "https://x/b.jpg")).toEqual({ venter: "c1" });
    expect(ig.udgivet()).toBe(0);
  });

  it("Instagram: mistet svar på selve udgivelsen giver 'venter', så næste kørsel kan tjekke, om den gik igennem", async () => {
    const ig = igHent(["FINISHED"], { publish: () => { throw new Error("netværk"); } });
    const meta = opretMeta({ fetch: ig.hent as never, vent: async () => {} });
    expect(await meta.instagramStory("ig", NOEGLE, "https://x/b.jpg")).toEqual({ venter: "c1" });
    expect(ig.udgivet()).toBe(1);
  });

  it("Instagram: en afvist udgivelse er en fejl, og beholder-id'et følger med", async () => {
    const ig = igHent(["FINISHED"], { publish: () => svar(400, { error: { code: 100, message: "Ugyldigt billede" } }) });
    const meta = opretMeta({ fetch: ig.hent as never, vent: async () => {} });
    const fejl = await meta.instagramStory("ig", NOEGLE, "https://x/b.jpg").catch((e) => e);
    expect(fejl).toBeInstanceOf(MetaFejl);
    expect(fejl.creationId).toBe("c1");
  });

  it("Instagram: svarer Meta, at beholderen ikke kan oprettes, er der intet beholder-id", async () => {
    const hent = vi.fn(async () => svar(400, { error: { code: 100, message: "Ugyldig url" } }));
    const meta = opretMeta({ fetch: hent as never });
    const fejl = await meta.instagramStory("ig", NOEGLE, "https://x/b.jpg").catch((e) => e);
    expect(fejl).toBeInstanceOf(MetaFejl);
    expect(fejl.creationId).toBeUndefined();
  });

  describe("instagramUdgiv (en beholder, der allerede findes)", () => {
    it("udgiver en færdig beholder", async () => {
      const ig = igHent(["FINISHED"]);
      const meta = opretMeta({ fetch: ig.hent as never, vent: async () => {} });
      expect(await meta.instagramUdgiv("ig", NOEGLE, "c1")).toEqual({ id: "ig1" });
      expect(ig.udgivet()).toBe(1);
    });
    it("venter, hvis beholderen stadig ikke er færdig, uden at vente i flere sekunder", async () => {
      const ig = igHent(["IN_PROGRESS"]);
      const vent = vi.fn(async () => {});
      const meta = opretMeta({ fetch: ig.hent as never, vent });
      expect(await meta.instagramUdgiv("ig", NOEGLE, "c1")).toEqual({ venter: "c1" });
      expect(ig.antalStatus()).toBe(1);
      expect(vent).not.toHaveBeenCalled();
      expect(ig.udgivet()).toBe(0);
    });
    it("udgiver ALDRIG igen, hvis beholderen allerede er udgivet", async () => {
      const ig = igHent(["PUBLISHED"]);
      const meta = opretMeta({ fetch: ig.hent as never, vent: async () => {} });
      expect(await meta.instagramUdgiv("ig", NOEGLE, "c1")).toEqual({ alleredeLagt: "c1" });
      expect(ig.udgivet()).toBe(0);
    });
    it.each(["ERROR", "EXPIRED"])("melder %s som ugyldig uden at udgive", async (kode) => {
      const ig = igHent([kode]);
      const meta = opretMeta({ fetch: ig.hent as never, vent: async () => {} });
      expect(await meta.instagramUdgiv("ig", NOEGLE, "c1")).toEqual({ ugyldig: kode });
      expect(ig.udgivet()).toBe(0);
    });
    it("tåler et netværksbrud ved statustjekket (prøves næste time)", async () => {
      const ig = igHent(["NETFEJL"]);
      const meta = opretMeta({ fetch: ig.hent as never, vent: async () => {} });
      expect(await meta.instagramUdgiv("ig", NOEGLE, "c1")).toEqual({ venter: "c1" });
    });
    it("kaster ved en død nøgle, og nøglen står ikke i beskeden", async () => {
      const hent = vi.fn(async () => svar(400, { error: { code: 190, message: `Token ${NOEGLE} er udløbet` } }));
      const meta = opretMeta({ fetch: hent as never });
      const fejl = await meta.instagramUdgiv("ig", NOEGLE, "c1").catch((e) => e);
      expect(fejl).toBeInstanceOf(MetaFejl);
      expect(fejl.art).toBe("noegle_doed");
      expect(String(fejl.message)).not.toContain(NOEGLE);
      expect(fejl.creationId).toBe("c1");
    });
    it("nægter at kalde uden nøgle", async () => {
      const hent = vi.fn();
      const meta = opretMeta({ fetch: hent as never });
      await expect(meta.instagramUdgiv("ig", "", "c1")).rejects.toThrow(/mangler/);
      expect(hent).not.toHaveBeenCalled();
    });
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

  it("lader en live-kørsel overtage en kladde, men aldrig en story, der er lagt op", async () => {
    await reserver(db, "2026-11-16", "eftermiddag", "facebook", "gavekort");
    await afslut(db, "2026-11-16", "eftermiddag", "facebook", "kladde", null, null);
    expect(await reserver(db, "2026-11-16", "eftermiddag", "facebook", "gavekort")).toBe(true);
    await afslut(db, "2026-11-16", "eftermiddag", "facebook", "lagt", "id1", null);
    expect(await reserver(db, "2026-11-16", "eftermiddag", "facebook", "gavekort")).toBe(false);
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
        instagramUdgiv: vi.fn(async () => ({ id: "ig-story" })),
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

  it("lægger dagens story op med det samme ved manuel kørsel, også efter en kladde", async () => {
    const kladde = deps({ now: new Date("2026-11-16T15:25:00Z") });
    kladde.indstillinger.tilstand = "kladde";
    await koerStories(kladde);
    const d = deps({ now: new Date("2026-11-16T15:47:00Z"), tvingSlot: "eftermiddag" });
    const r = await koerStories(d);
    expect(r.type).toBe("gavekort");
    expect(d.meta.facebookStory).toHaveBeenCalledWith("side", NOEGLE, expect.stringContaining("/eftermiddag/2026-11-16"));
    expect((await hentLog(db, 5)).map((l) => l.status)).toEqual(["lagt", "lagt"]);
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

  // --- Instagram: venter, udgives næste time, aldrig to gange ---------------------

  const MORGEN = new Date("2026-11-17T07:25:00Z"); // 17/11 kl. 8.25 dansk tid
  const TIME_EFTER = new Date("2026-11-17T08:25:00Z"); // kl. 9.25
  const UDEN_FOR_SLOT = new Date("2026-11-17T11:25:00Z"); // kl. 12.25: ingen story

  const mock = <T extends keyof Meta>(d: KoerselDeps, navn: T) => d.meta[navn] as unknown as ReturnType<typeof vi.fn>;
  const instagramRaekke = async () => (await hentLog(db, 10)).find((l) => l.platform === "instagram");

  /** Første kørsel kl. 8.25: Instagram når ikke at blive færdig. */
  async function foersteKoerselMedVenter() {
    const d = deps({ now: MORGEN });
    mock(d, "instagramStory").mockResolvedValue({ venter: "c1" });
    const r = await koerStories(d);
    return { d, r };
  }

  it("gemmer en beholder, der ikke er færdig, som 'venter' med beholder-id, ikke som 'fejl'", async () => {
    const { r } = await foersteKoerselMedVenter();
    expect(r.platforme).toEqual([
      { platform: "facebook", status: "lagt" },
      { platform: "instagram", status: "venter" },
    ]);
    expect(await instagramRaekke()).toMatchObject({ status: "venter", meta_id: "c1" });
  });

  it("udgiver den ventende beholder ved næste timekørsel, når den er færdig", async () => {
    await foersteKoerselMedVenter();
    const d = deps({ now: TIME_EFTER });
    const r = await koerStories(d);
    expect(mock(d, "instagramUdgiv")).toHaveBeenCalledTimes(1);
    expect(mock(d, "instagramUdgiv")).toHaveBeenCalledWith("ig", NOEGLE, "c1");
    expect(mock(d, "instagramStory")).not.toHaveBeenCalled();
    expect(r.ventende).toEqual([{ slot: "morgen", status: "lagt" }]);
    expect(await instagramRaekke()).toMatchObject({ status: "lagt", meta_id: "ig-story" });
  });

  it("tjekker ventende rækker også uden for story-tidspunkterne", async () => {
    await foersteKoerselMedVenter();
    const d = deps({ now: UDEN_FOR_SLOT });
    const r = await koerStories(d);
    expect(r.slot).toBeNull();
    expect(mock(d, "instagramUdgiv")).toHaveBeenCalledTimes(1);
    expect(await instagramRaekke()).toMatchObject({ status: "lagt" });
  });

  it("lader den blive stående som 'venter', hvis Instagram stadig ikke er færdig, og prøver igen næste time", async () => {
    await foersteKoerselMedVenter();
    const d1 = deps({ now: TIME_EFTER });
    mock(d1, "instagramUdgiv").mockResolvedValue({ venter: "c1" });
    expect((await koerStories(d1)).ventende).toEqual([{ slot: "morgen", status: "venter" }]);
    expect(await instagramRaekke()).toMatchObject({ status: "venter", meta_id: "c1" });
    const d2 = deps({ now: new Date("2026-11-17T09:25:00Z") });
    await koerStories(d2);
    expect(mock(d2, "instagramUdgiv")).toHaveBeenCalledTimes(1);
    expect(await instagramRaekke()).toMatchObject({ status: "lagt" });
  });

  it.each(["ERROR", "EXPIRED"])("gør en ventende række til 'fejl', når Instagram melder %s", async (kode) => {
    await foersteKoerselMedVenter();
    const d = deps({ now: TIME_EFTER });
    mock(d, "instagramUdgiv").mockResolvedValue({ ugyldig: kode });
    const r = await koerStories(d);
    expect(r.ventende?.[0]).toMatchObject({ slot: "morgen", status: "fejl" });
    expect(r.ventende?.[0].besked).toContain(kode);
    const raekke = await instagramRaekke();
    expect(raekke).toMatchObject({ status: "fejl" });
    expect(raekke?.besked).toContain(kode);
  });

  it("lader en ventende række blive stående ved et netværksbrud, men gør den til 'fejl' ved en død nøgle", async () => {
    await foersteKoerselMedVenter();
    const d1 = deps({ now: TIME_EFTER });
    mock(d1, "instagramUdgiv").mockRejectedValue(new MetaFejl("Intet svar fra Meta", "uvist"));
    await koerStories(d1);
    expect(await instagramRaekke()).toMatchObject({ status: "venter", meta_id: "c1" });
    const d2 = deps({ now: new Date("2026-11-17T09:25:00Z") });
    mock(d2, "instagramUdgiv").mockRejectedValue(new MetaFejl("Meta svarede 400: udløbet", "noegle_doed", 190));
    await koerStories(d2);
    expect(await instagramRaekke()).toMatchObject({ status: "fejl", meta_id: "c1" });
  });

  it("udgiver ikke to gange, hvis to kørsler tjekker samtidig", async () => {
    await foersteKoerselMedVenter();
    const a = deps({ now: TIME_EFTER });
    const b = deps({ now: TIME_EFTER });
    const langsom = async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { id: "ig-story" };
    };
    mock(a, "instagramUdgiv").mockImplementation(langsom);
    mock(b, "instagramUdgiv").mockImplementation(langsom);
    await Promise.all([koerStories(a), koerStories(b)]);
    expect(mock(a, "instagramUdgiv").mock.calls.length + mock(b, "instagramUdgiv").mock.calls.length).toBe(1);
    expect(await instagramRaekke()).toMatchObject({ status: "lagt" });
  });

  it("rører aldrig en række, der allerede er lagt", async () => {
    await foersteKoerselMedVenter();
    await koerStories(deps({ now: TIME_EFTER }));
    const d = deps({ now: new Date("2026-11-17T09:25:00Z") });
    await koerStories(d);
    expect(mock(d, "instagramUdgiv")).not.toHaveBeenCalled();
    expect(mock(d, "instagramStory")).not.toHaveBeenCalled();
  });

  it("tjekker kun dagens ventende rækker, ikke gårsdagens", async () => {
    await foersteKoerselMedVenter();
    const d = deps({ now: new Date("2026-11-18T08:25:00Z") });
    await koerStories(d);
    expect(mock(d, "instagramUdgiv")).not.toHaveBeenCalled();
    expect((await hentLog(db, 10)).find((l) => l.dato === "2026-11-17" && l.platform === "instagram")).toMatchObject({ status: "venter" });
  });

  it("udgiver ikke ventende rækker i kladde, når stories er slået fra, eller når skabelonen ikke er godkendt", async () => {
    await foersteKoerselMedVenter();
    const kladde = deps({ now: TIME_EFTER });
    kladde.indstillinger.tilstand = "kladde";
    await koerStories(kladde);
    const fra = deps({ now: TIME_EFTER });
    fra.indstillinger.tilstand = "fra";
    await koerStories(fra);
    const ikkeGodkendt = deps({ now: TIME_EFTER });
    ikkeGodkendt.indstillinger.godkendt = [];
    await koerStories(ikkeGodkendt);
    for (const d of [kladde, fra, ikkeGodkendt]) expect(mock(d, "instagramUdgiv")).not.toHaveBeenCalled();
    expect(await instagramRaekke()).toMatchObject({ status: "venter" });
  });

  it("en fejl i at tjekke ventende rækker stopper ikke dagens story", async () => {
    await foersteKoerselMedVenter();
    const d = deps({ now: new Date("2026-11-17T14:25:00Z") }); // 15.25, ingen story: tjek kun ventende
    mock(d, "instagramUdgiv").mockRejectedValue(new Error("uventet"));
    await expect(koerStories(d)).resolves.toBeTruthy();
    const eftermiddag = deps({ now: new Date("2026-11-17T15:25:00Z") });
    mock(eftermiddag, "instagramUdgiv").mockRejectedValue(new Error("uventet"));
    const r = await koerStories(eftermiddag);
    expect(r.slot).toBe("eftermiddag");
    expect(mock(eftermiddag, "facebookStory")).toHaveBeenCalledTimes(1);
  });

  it("gemmer en mistet udgivelse som 'venter' med beholder-id, så den kan tjekkes næste time", async () => {
    const d = deps({ now: MORGEN });
    mock(d, "instagramStory").mockResolvedValue({ venter: "c9" });
    await koerStories(d);
    expect(await instagramRaekke()).toMatchObject({ status: "venter", meta_id: "c9" });
  });

  it("gemmer beholder-id'et, når Instagram afviser udgivelsen (fejl)", async () => {
    const d = deps({ now: MORGEN });
    const fejl = new MetaFejl("Meta svarede 400: Ugyldigt billede", "afvist", 100);
    fejl.creationId = "c5";
    mock(d, "instagramStory").mockRejectedValue(fejl);
    const r = await koerStories(d);
    expect(r.platforme.find((p) => p.platform === "instagram")).toMatchObject({ status: "fejl", besked: "Meta svarede 400: Ugyldigt billede" });
    expect(await instagramRaekke()).toMatchObject({ status: "fejl", meta_id: "c5" });
  });

  it("allerede udgivet hos Instagram bliver til 'lagt' uden ny udgivelse", async () => {
    await foersteKoerselMedVenter();
    const d = deps({ now: TIME_EFTER });
    mock(d, "instagramUdgiv").mockResolvedValue({ alleredeLagt: "c1" });
    const r = await koerStories(d);
    expect(r.ventende?.[0]).toMatchObject({ slot: "morgen", status: "lagt" });
    expect(await instagramRaekke()).toMatchObject({ status: "lagt" });
  });

  describe("manuel kørsel: prøv Instagram igen", () => {
    async function medFejl(meta_id: string | null = null) {
      const d = deps({ now: MORGEN });
      const f = new MetaFejl("Meta svarede 500", "afvist");
      if (meta_id) f.creationId = meta_id;
      mock(d, "instagramStory").mockRejectedValue(f);
      await koerStories(d);
      expect(await instagramRaekke()).toMatchObject({ status: "fejl" });
    }
    const manuel = (over: Partial<KoerselDeps> = {}) =>
      deps({ now: new Date("2026-11-17T10:47:00Z"), tvingSlot: "morgen", proevInstagramIgen: true, ...over });

    it("prøver Instagram igen, når dagens række står som 'fejl'", async () => {
      await medFejl();
      const d = manuel();
      const r = await koerStories(d);
      expect(mock(d, "instagramStory")).toHaveBeenCalledTimes(1);
      expect(r.platforme.find((p) => p.platform === "instagram")).toMatchObject({ status: "lagt" });
      expect(await instagramRaekke()).toMatchObject({ status: "lagt", meta_id: "ig1" });
    });

    it("rører ikke Facebook, som allerede er lagt", async () => {
      await medFejl();
      const d = manuel();
      const r = await koerStories(d);
      expect(mock(d, "facebookStory")).not.toHaveBeenCalled();
      expect(r.platforme.find((p) => p.platform === "facebook")).toMatchObject({ status: "findes" });
    });

    it("prøver ALDRIG igen, når Instagram-rækken står som 'lagt'", async () => {
      await koerStories(deps({ now: MORGEN }));
      expect(await instagramRaekke()).toMatchObject({ status: "lagt" });
      const d = manuel();
      const r = await koerStories(d);
      expect(mock(d, "instagramStory")).not.toHaveBeenCalled();
      expect(mock(d, "instagramUdgiv")).not.toHaveBeenCalled();
      expect(r.platforme.find((p) => p.platform === "instagram")).toMatchObject({ status: "findes" });
      expect(await instagramRaekke()).toMatchObject({ status: "lagt", meta_id: "ig1" });
    });

    it("prøver ikke igen uden 'prøv igen' (cron gør det aldrig af sig selv)", async () => {
      await medFejl();
      const d = manuel({ proevInstagramIgen: false });
      await koerStories(d);
      expect(mock(d, "instagramStory")).not.toHaveBeenCalled();
      expect(await instagramRaekke()).toMatchObject({ status: "fejl" });
    });

    it("prøver ikke igen i kladde eller for en skabelon, der ikke er godkendt", async () => {
      await medFejl();
      const kladde = manuel();
      kladde.indstillinger.tilstand = "kladde";
      await koerStories(kladde);
      const ikkeGodkendt = manuel();
      ikkeGodkendt.indstillinger.godkendt = [];
      await koerStories(ikkeGodkendt);
      expect(mock(kladde, "instagramStory")).not.toHaveBeenCalled();
      expect(mock(ikkeGodkendt, "instagramStory")).not.toHaveBeenCalled();
      expect(await instagramRaekke()).toMatchObject({ status: "fejl" });
    });

    it("prøver Facebook igen? Nej: en Facebook-fejl prøves aldrig automatisk igen", async () => {
      const d0 = deps({ now: MORGEN });
      mock(d0, "facebookStory").mockRejectedValue(new MetaFejl("Meta svarede 500", "uvist"));
      await koerStories(d0);
      const d = manuel();
      await koerStories(d);
      expect(mock(d, "facebookStory")).not.toHaveBeenCalled();
    });

    it("bruger den gamle beholder, hvis den findes, i stedet for at lave en ny", async () => {
      await medFejl("c7");
      const d = manuel();
      await koerStories(d);
      expect(mock(d, "instagramUdgiv")).toHaveBeenCalledWith("ig", NOEGLE, "c7");
      expect(mock(d, "instagramStory")).not.toHaveBeenCalled();
      expect(await instagramRaekke()).toMatchObject({ status: "lagt", meta_id: "ig-story" });
    });

    it("udgiver ALDRIG igen, når den gamle beholder allerede er udgivet", async () => {
      await medFejl("c7");
      const d = manuel();
      mock(d, "instagramUdgiv").mockResolvedValue({ alleredeLagt: "c7" });
      const r = await koerStories(d);
      expect(mock(d, "instagramStory")).not.toHaveBeenCalled();
      expect(r.platforme.find((p) => p.platform === "instagram")).toMatchObject({ status: "lagt" });
      expect(await instagramRaekke()).toMatchObject({ status: "lagt" });
    });

    it("laver en ny beholder, når den gamle er ERROR eller EXPIRED", async () => {
      await medFejl("c7");
      const d = manuel();
      mock(d, "instagramUdgiv").mockResolvedValue({ ugyldig: "EXPIRED" });
      await koerStories(d);
      expect(mock(d, "instagramStory")).toHaveBeenCalledTimes(1);
      expect(await instagramRaekke()).toMatchObject({ status: "lagt", meta_id: "ig1" });
    });

    it("kan ende som 'venter' igen, hvis Instagram stadig ikke er færdig", async () => {
      await medFejl();
      const d = manuel();
      mock(d, "instagramStory").mockResolvedValue({ venter: "c8" });
      const r = await koerStories(d);
      expect(r.platforme.find((p) => p.platform === "instagram")).toMatchObject({ status: "venter" });
      expect(await instagramRaekke()).toMatchObject({ status: "venter", meta_id: "c8" });
    });

    it("to samtidige klik giver kun ét forsøg", async () => {
      await medFejl();
      const a = manuel();
      const b = manuel();
      const langsom = async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { id: "ig1" };
      };
      mock(a, "instagramStory").mockImplementation(langsom);
      mock(b, "instagramStory").mockImplementation(langsom);
      await Promise.all([koerStories(a), koerStories(b)]);
      expect(mock(a, "instagramStory").mock.calls.length + mock(b, "instagramStory").mock.calls.length).toBe(1);
    });
  });

  // --- Migration 010 og sikkerhed uden den -----------------------------------------

  describe("migration 010 (status 'venter')", () => {
    it("tillader 'venter' og kan køres to gange", async () => {
      await reserver(db, "2026-11-17", "morgen", "instagram", "nedtaelling");
      await afslut(db, "2026-11-17", "morgen", "instagram", "venter", "c1", null);
      const sql = await readFile(join(process.cwd(), "migrations", "010_story_log_venter.sql"), "utf8");
      await runSqlScript(db, sql);
      await runSqlScript(db, sql);
      expect(await instagramRaekke()).toMatchObject({ status: "venter", meta_id: "c1" });
    });

    it("erstatter den eksisterende regel (der er kun én) og afviser stadig ukendte statusser", async () => {
      const r = await db.query<{ navn: string; def: string }>(
        `SELECT conname AS navn, pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conrelid = 'story_log'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%i_gang%'`
      );
      expect(r.rows.map((x) => x.navn)).toEqual(["story_log_status_check"]);
      expect(r.rows[0].def).toContain("venter");
      await reserver(db, "2026-11-17", "morgen", "instagram", "nedtaelling");
      await expect(afslut(db, "2026-11-17", "morgen", "instagram", "noget" as never, null, null)).rejects.toThrow();
    });

    it("migration 009 giver reglen det navn, som 010 forventer", async () => {
      const pg = new PGlite();
      const frisk: Queryable = { query: (t, p) => pg.query(t, p as never[]) as never };
      await runSqlScript(frisk, await readFile(join(process.cwd(), "migrations", "009_story_log.sql"), "utf8"));
      const r = await frisk.query<{ navn: string }>(
        `SELECT conname AS navn FROM pg_constraint WHERE conrelid = 'story_log'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%i_gang%'`
      );
      expect(r.rows.map((x) => x.navn)).toEqual(["story_log_status_check"]);
    });

    it("uden migrationen gemmes en ventende beholder som 'fejl' med beholder-id i beskeden (sikkert at flette først)", async () => {
      await db.query(`ALTER TABLE story_log DROP CONSTRAINT story_log_status_check`);
      await db.query(
        `ALTER TABLE story_log ADD CONSTRAINT story_log_status_check CHECK (status IN ('i_gang','lagt','fejl','kladde'))`
      );
      try {
        const d = deps({ now: MORGEN });
        mock(d, "instagramStory").mockResolvedValue({ venter: "c3" });
        const r = await koerStories(d);
        const ig = r.platforme.find((p) => p.platform === "instagram");
        expect(ig?.status).toBe("fejl");
        expect(ig?.besked).toContain("c3");
        expect(ig?.besked).toMatch(/migration 010/i);
        // Rækken hænger ikke i 'i_gang': den står som fejl og kan prøves igen med knappen.
        expect(await instagramRaekke()).toMatchObject({ status: "fejl", meta_id: "c3" });
      } finally {
        await runSqlScript(db, await readFile(join(process.cwd(), "migrations", "010_story_log_venter.sql"), "utf8"));
      }
    });
  });

  describe("log: overtag og hentVentende", () => {
    it("overtager en ventende række kun én gang og giver beholder-id'et", async () => {
      await reserver(db, "2026-11-17", "morgen", "instagram", "nedtaelling");
      await afslut(db, "2026-11-17", "morgen", "instagram", "venter", "c1", null);
      expect(await overtag(db, "2026-11-17", "morgen", "instagram", "venter")).toEqual({ metaId: "c1" });
      expect(await overtag(db, "2026-11-17", "morgen", "instagram", "venter")).toBeNull();
    });
    it("overtager aldrig en række, der er lagt, i gang eller kladde", async () => {
      for (const status of ["lagt", "kladde"] as const) {
        await db.query("DELETE FROM story_log");
        await reserver(db, "2026-11-17", "morgen", "instagram", "nedtaelling");
        await afslut(db, "2026-11-17", "morgen", "instagram", status, "x", null);
        expect(await overtag(db, "2026-11-17", "morgen", "instagram", "venter")).toBeNull();
        expect(await overtag(db, "2026-11-17", "morgen", "instagram", "fejl")).toBeNull();
      }
      await db.query("DELETE FROM story_log");
      await reserver(db, "2026-11-17", "morgen", "instagram", "nedtaelling"); // i_gang
      expect(await overtag(db, "2026-11-17", "morgen", "instagram", "fejl")).toBeNull();
    });
    it("hentVentende giver kun dagens ventende Instagram-rækker", async () => {
      await reserver(db, "2026-11-17", "morgen", "instagram", "nedtaelling");
      await afslut(db, "2026-11-17", "morgen", "instagram", "venter", "c1", null);
      await reserver(db, "2026-11-17", "eftermiddag", "instagram", "gavekort");
      await afslut(db, "2026-11-17", "eftermiddag", "instagram", "lagt", "x", null);
      await reserver(db, "2026-11-16", "morgen", "instagram", "pladser");
      await afslut(db, "2026-11-16", "morgen", "instagram", "venter", "c0", null);
      await reserver(db, "2026-11-17", "morgen", "facebook", "nedtaelling");
      await afslut(db, "2026-11-17", "morgen", "facebook", "venter", "f1", null);
      expect(await hentVentende(db, "2026-11-17")).toEqual([{ slot: "morgen", type: "nedtaelling" }]);
    });
  });

  describe("loglinjer (cron-ruten)", () => {
    it("skriver fejlbeskeden med: instagram=fejl(<besked>)", () => {
      const l = loglinjer(
        {
          dato: "2026-11-17",
          slot: "morgen",
          type: "nedtaelling",
          platforme: [
            { platform: "facebook", status: "lagt" },
            { platform: "instagram", status: "fejl", besked: "Meta svarede 400: Ugyldigt billede" },
          ],
        },
        NOEGLE
      );
      expect(l).toEqual(["Stories 2026-11-17 morgen: nedtaelling facebook=lagt instagram=fejl(Meta svarede 400: Ugyldigt billede)"]);
    });
    it("skriver aldrig nøglen, heller ikke hvis den skulle stå i en besked", () => {
      const l = loglinjer(
        {
          dato: "2026-11-17",
          slot: "morgen",
          type: "nedtaelling",
          platforme: [{ platform: "instagram", status: "fejl", besked: `Token ${NOEGLE} er udløbet` }],
        },
        NOEGLE
      ).join("\n");
      expect(l).not.toContain(NOEGLE);
      expect(l).toContain("***");
    });
    it("holder beskeden kort og på én linje", () => {
      const l = loglinjer(
        {
          dato: "2026-11-17",
          slot: "morgen",
          type: "nedtaelling",
          platforme: [{ platform: "instagram", status: "fejl", besked: "a\nb ".repeat(200) }],
        },
        NOEGLE
      );
      expect(l).toHaveLength(1);
      expect(l[0]).not.toContain("\n");
      expect(l[0].length).toBeLessThan(400);
    });
    it("viser også ventende rækker, der blev behandlet, og kørsler uden story", () => {
      const l = loglinjer(
        {
          dato: "2026-11-17",
          slot: null,
          type: null,
          platforme: [],
          ventende: [
            { slot: "morgen", status: "lagt" },
            { slot: "eftermiddag", status: "fejl", besked: "Instagram kunne ikke bruge billedet (EXPIRED)" },
          ],
        },
        NOEGLE
      );
      expect(l).toEqual([
        "Stories 2026-11-17 morgen (ventede): instagram=lagt",
        "Stories 2026-11-17 eftermiddag (ventede): instagram=fejl(Instagram kunne ikke bruge billedet (EXPIRED))",
      ]);
    });
    it("skriver ingenting for en kørsel uden story og uden ventende rækker", () => {
      expect(loglinjer({ dato: "2026-11-17", slot: null, type: null, platforme: [] }, NOEGLE)).toEqual([]);
    });
  });
});
