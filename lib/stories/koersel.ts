// Selve kørslen, som cron kalder hver time. Alt udefra (database, Meta,
// forestillinger, klokken) sendes ind, så det hele kan testes uden netværk.
//
// Sikkerhed:
//  - STORIES_TILSTAND: fra | kladde | live. Alt andet end "live" eller "fra"
//    betyder kladde, så en tastefejl aldrig lægger noget op.
//  - I live skal skabelonen desuden stå i STORIES_GODKENDT.
//  - Højst én story pr. dag, tidspunkt og platform (story_log). Fejl prøves
//    ikke igen automatisk; de vises på /admin/stories, hvor "Læg op nu" kan
//    prøve Instagram igen, hvis dagens række står som "fejl".
//  - Instagram: er beholderen ikke færdig, gemmes den som "venter" (med
//    beholder-id i meta_id). Hver timekørsel tjekker dagens ventende rækker og
//    udgiver dem, når Instagram siger FINISHED. En række overtages atomart
//    (overtag), og en beholder, der allerede er PUBLISHED, udgives aldrig igen,
//    så en story aldrig kommer to gange.

import type { Queryable } from "@/lib/db";
import { danskTid, slotForTime, vaelgStory, STORY_TYPER, type ShowInfo, type Slot, type StoryType } from "./plan";
import { MetaFejl, type Meta } from "./meta";
import { reserver, afslut, overtag, hentVentende, type Platform } from "./log";

/** Bakkens Hviles Facebook-side og Instagram-konto. Ikke hemmelige. */
export const STANDARD_SIDE_ID = "346340642148568";
export const STANDARD_INSTAGRAM_ID = "17841448242567555";

export type Tilstand = "fra" | "kladde" | "live";

export interface Indstillinger {
  tilstand: Tilstand;
  godkendt: StoryType[];
  noegle: string;
  sideId: string;
  instagramId: string;
}

export function laesIndstillinger(env: Record<string, string | undefined>): Indstillinger {
  const t = String(env.STORIES_TILSTAND ?? "").trim().toLowerCase();
  const tilstand: Tilstand = t === "live" ? "live" : t === "fra" ? "fra" : "kladde";
  const godkendt = String(env.STORIES_GODKENDT ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is StoryType => (STORY_TYPER as string[]).includes(s));
  return {
    tilstand,
    godkendt,
    noegle: String(env.META_PAGE_TOKEN ?? "").trim(),
    sideId: String(env.META_PAGE_ID ?? "").trim() || STANDARD_SIDE_ID,
    instagramId: String(env.META_INSTAGRAM_ID ?? "").trim() || STANDARD_INSTAGRAM_ID,
  };
}

export interface KoerselDeps {
  db: Queryable;
  now: Date;
  hentShows: () => Promise<ShowInfo[]>;
  meta: Meta;
  indstillinger: Indstillinger;
  billedUrl: (slot: Slot, dato: string) => string;
  /** Kør et bestemt tidspunkt uanset klokken (kun til manuel kørsel). */
  tvingSlot?: Slot;
  /**
   * Kun manuel kørsel: står dagens Instagram-række som "fejl", prøves den igen.
   * En række, der er "lagt", røres aldrig. Cron sætter aldrig denne.
   */
  proevInstagramIgen?: boolean;
}

export interface Koerselsresultat {
  dato: string;
  slot: Slot | null;
  type: StoryType | null;
  platforme: { platform: Platform; status: string; besked?: string }[];
  /** Ventende Instagram-rækker fra tidligere kørsler i dag, der blev tjekket nu. */
  ventende?: { slot: Slot; status: string; besked?: string }[];
  fejl?: string;
}

const PLATFORME: Platform[] = ["facebook", "instagram"];

/** Indstillinger, der kræves for at udgive en bestemt type: live og godkendt skabelon. */
function maaUdgive(i: Indstillinger, type: string): boolean {
  return i.tilstand === "live" && (i.godkendt as string[]).includes(type);
}

const kort = (e: unknown) => (e instanceof Error ? e.message : "Ukendt fejl");

type PlatformUdfald = { status: "lagt" | "venter" | "fejl"; besked?: string };

/**
 * Gemmer en ventende beholder. Har databasen endnu ikke migration 010 (reglen
 * på status), afvises "venter". Så gemmes rækken som "fejl" med beholder-id'et
 * i beskeden i stedet for at hænge i "i_gang", og et klik på "Læg op nu"
 * bruger den samme beholder uden at udgive to gange.
 */
async function gemVenter(
  db: Queryable,
  dato: string,
  slot: Slot,
  creationId: string
): Promise<PlatformUdfald> {
  try {
    await afslut(db, dato, slot, "instagram", "venter", creationId, null);
    return { status: "venter" };
  } catch {
    const besked = `Instagram var ikke færdig med billedet (beholder ${creationId}), men status "venter" kunne ikke gemmes. Kør migration 010 i Neon.`;
    await afslut(db, dato, slot, "instagram", "fejl", creationId, besked);
    return { status: "fejl", besked };
  }
}

/**
 * Skriver udfaldet af et Instagram-kald i loggen. `ventendeRaekke`: rækken er
 * en ventende, der blev tjekket igen. Så er et netværksbrud eller en grænse for
 * antal kald ikke en fejl, men "venter" til næste time.
 */
async function gemInstagramUdfald(
  d: KoerselDeps,
  dato: string,
  slot: Slot,
  kald: () => Promise<Awaited<ReturnType<Meta["instagramStory"]>> | { ugyldig: string }>,
  beholderFoer: string | null,
  ventendeRaekke: boolean
): Promise<PlatformUdfald | { ugyldig: string }> {
  try {
    const r = await kald();
    if ("ugyldig" in r) return r;
    if ("id" in r) {
      await afslut(d.db, dato, slot, "instagram", "lagt", r.id, null);
      return { status: "lagt" };
    }
    if ("alleredeLagt" in r) {
      await afslut(d.db, dato, slot, "instagram", "lagt", r.alleredeLagt, "Allerede udgivet hos Instagram");
      return { status: "lagt" };
    }
    return gemVenter(d.db, dato, slot, r.venter);
  } catch (e) {
    const besked = kort(e);
    const beholder = e instanceof MetaFejl ? e.creationId ?? beholderFoer : beholderFoer;
    if (ventendeRaekke && beholder && e instanceof MetaFejl && (e.art === "uvist" || e.art === "graense")) {
      return gemVenter(d.db, dato, slot, beholder);
    }
    await afslut(d.db, dato, slot, "instagram", "fejl", beholder, besked);
    return { status: "fejl", besked };
  }
}

/**
 * Tjekker dagens ventende Instagram-rækker og udgiver dem, når beholderen er
 * færdig. Kun i live og kun for godkendte skabeloner, som ved en almindelig
 * kørsel. Hver række overtages atomart først, så to kørsler aldrig udgiver
 * den samme.
 */
async function behandlVentende(d: KoerselDeps, dato: string): Promise<NonNullable<Koerselsresultat["ventende"]>> {
  const ud: NonNullable<Koerselsresultat["ventende"]> = [];
  for (const raekke of await hentVentende(d.db, dato)) {
    if (!maaUdgive(d.indstillinger, raekke.type)) continue;
    const taget = await overtag(d.db, dato, raekke.slot, "instagram", "venter");
    if (!taget) continue; // en anden kørsel nåede den først
    if (!taget.metaId) {
      const besked = "Den ventende række har intet beholder-id";
      await afslut(d.db, dato, raekke.slot, "instagram", "fejl", null, besked);
      ud.push({ slot: raekke.slot, status: "fejl", besked });
      continue;
    }
    const { noegle, instagramId } = d.indstillinger;
    const u = await gemInstagramUdfald(
      d,
      dato,
      raekke.slot,
      () => d.meta.instagramUdgiv(instagramId, noegle, taget.metaId as string),
      taget.metaId,
      true
    );
    if ("ugyldig" in u) {
      const besked = `Instagram kunne ikke bruge billedet (${u.ugyldig})`;
      await afslut(d.db, dato, raekke.slot, "instagram", "fejl", taget.metaId, besked);
      ud.push({ slot: raekke.slot, status: "fejl", besked });
    } else {
      ud.push({ slot: raekke.slot, status: u.status, ...(u.besked ? { besked: u.besked } : {}) });
    }
  }
  return ud;
}

export async function koerStories(d: KoerselDeps): Promise<Koerselsresultat> {
  const { dato, time } = danskTid(d.now);
  const slot = d.tvingSlot ?? slotForTime(time);
  const res: Koerselsresultat = { dato, slot, type: null, platforme: [] };
  if (d.indstillinger.tilstand === "fra") return res;

  // Ventende Instagram-rækker tjekkes ved HVER timekørsel, også uden for de to
  // story-tidspunkter. En fejl her må ikke stoppe dagens story.
  try {
    const ventende = await behandlVentende(d, dato);
    if (ventende.length > 0) res.ventende = ventende;
  } catch (e) {
    console.error("Stories: de ventende Instagram-rækker kunne ikke tjekkes", kort(e));
  }

  if (!slot) return res;

  let shows: ShowInfo[];
  try {
    shows = await d.hentShows();
  } catch {
    res.fejl = "Kunne ikke hente forestillinger fra Airtable";
    // Skrives i loggen, så fejlen kan ses på /admin/stories.
    for (const platform of PLATFORME) {
      if (await reserver(d.db, dato, slot, platform, "ukendt")) {
        await afslut(d.db, dato, slot, platform, "fejl", null, res.fejl);
      }
    }
    return res;
  }

  const story = vaelgStory(slot, dato, shows);
  if (!story) return res;
  res.type = story.type;

  const live = maaUdgive(d.indstillinger, story.type);
  const billede = d.billedUrl(slot, dato);
  const { noegle, sideId, instagramId } = d.indstillinger;

  for (const platform of PLATFORME) {
    let genoptag: { metaId: string | null } | null = null;
    if (!(await reserver(d.db, dato, slot, platform, story.type))) {
      // Rækken findes. Kun manuelt, kun Instagram og kun en række, der står som
      // "fejl", prøves igen. "lagt", "venter" og "i_gang" røres aldrig her.
      if (platform === "instagram" && d.proevInstagramIgen && live) {
        genoptag = await overtag(d.db, dato, slot, "instagram", "fejl");
      }
      if (!genoptag) {
        res.platforme.push({ platform, status: "findes" });
        continue;
      }
    } else if (!live) {
      await afslut(d.db, dato, slot, platform, "kladde", null, null);
      res.platforme.push({ platform, status: "kladde" });
      continue;
    }

    if (platform === "facebook") {
      try {
        const r = await d.meta.facebookStory(sideId, noegle, billede);
        await afslut(d.db, dato, slot, platform, "lagt", r.id, null);
        res.platforme.push({ platform, status: "lagt" });
      } catch (e) {
        const besked = kort(e);
        await afslut(d.db, dato, slot, platform, "fejl", null, besked);
        res.platforme.push({ platform, status: "fejl", besked });
      }
      continue;
    }

    // Instagram. Ved et nyt forsøg efter en fejl bruges den gamle beholder, hvis
    // den findes (den kan allerede være udgivet); er den ugyldig, laves en ny.
    let u: PlatformUdfald | { ugyldig: string } | null = null;
    if (genoptag?.metaId) {
      const gammel = genoptag.metaId;
      u = await gemInstagramUdfald(d, dato, slot, () => d.meta.instagramUdgiv(instagramId, noegle, gammel), gammel, true);
      if ("ugyldig" in u) u = null;
    }
    if (!u) {
      u = await gemInstagramUdfald(d, dato, slot, () => d.meta.instagramStory(instagramId, noegle, billede), null, false);
    }
    if ("ugyldig" in u) {
      // Kan kun ske i det sjældne tilfælde, at den nye beholder straks er ugyldig.
      const besked = `Instagram kunne ikke bruge billedet (${u.ugyldig})`;
      await afslut(d.db, dato, slot, platform, "fejl", null, besked);
      res.platforme.push({ platform, status: "fejl", besked });
    } else {
      res.platforme.push({ platform, status: u.status, ...(u.besked ? { besked: u.besked } : {}) });
    }
  }
  return res;
}

const ENLINJE = (t: string, noegle: string, max = 200) => {
  const rent = noegle ? t.split(noegle).join("***") : t;
  return rent.replace(/\s+/g, " ").trim().slice(0, max);
};

/**
 * Linjerne til Vercels log for en kørsel. Fejlbeskeden står med, fx
 * "instagram=fejl(Meta svarede 400: ...)", men aldrig nøglen.
 */
export function loglinjer(res: Koerselsresultat, noegle: string): string[] {
  const del = (platform: string, status: string, besked?: string) =>
    `${platform}=${status}${besked ? `(${ENLINJE(besked, noegle)})` : ""}`;
  const ud: string[] = [];
  for (const v of res.ventende ?? []) {
    ud.push(`Stories ${res.dato} ${v.slot} (ventede): ${del("instagram", v.status, v.besked)}`);
  }
  if (res.slot) {
    const p = res.platforme.map((x) => del(x.platform, x.status, x.besked)).join(" ") || "ingen story";
    ud.push(`Stories ${res.dato} ${res.slot}: ${res.type ?? "-"} ${p}`);
  }
  return ud;
}
