// Selve kørslen, som cron kalder hver time. Alt udefra (database, Meta,
// forestillinger, klokken) sendes ind, så det hele kan testes uden netværk.
//
// Sikkerhed:
//  - STORIES_TILSTAND: fra | kladde | live. Alt andet end "live" eller "fra"
//    betyder kladde, så en tastefejl aldrig lægger noget op.
//  - I live skal skabelonen desuden stå i STORIES_GODKENDT.
//  - Højst én story pr. dag, tidspunkt og platform (story_log). Fejl prøves
//    ikke igen automatisk; de vises på /admin/stories.

import type { Queryable } from "@/lib/db";
import { danskTid, slotForTime, vaelgStory, STORY_TYPER, type ShowInfo, type Slot, type StoryType } from "./plan";
import type { Meta } from "./meta";
import { reserver, afslut, type Platform } from "./log";

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
}

export interface Koerselsresultat {
  dato: string;
  slot: Slot | null;
  type: StoryType | null;
  platforme: { platform: Platform; status: string; besked?: string }[];
  fejl?: string;
}

const PLATFORME: Platform[] = ["facebook", "instagram"];

export async function koerStories(d: KoerselDeps): Promise<Koerselsresultat> {
  const { dato, time } = danskTid(d.now);
  const slot = d.tvingSlot ?? slotForTime(time);
  const res: Koerselsresultat = { dato, slot, type: null, platforme: [] };
  if (!slot || d.indstillinger.tilstand === "fra") return res;

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

  const live = d.indstillinger.tilstand === "live" && d.indstillinger.godkendt.includes(story.type);
  const billede = d.billedUrl(slot, dato);

  for (const platform of PLATFORME) {
    if (!(await reserver(d.db, dato, slot, platform, story.type))) {
      res.platforme.push({ platform, status: "findes" });
      continue;
    }
    if (!live) {
      await afslut(d.db, dato, slot, platform, "kladde", null, null);
      res.platforme.push({ platform, status: "kladde" });
      continue;
    }
    try {
      const { noegle, sideId, instagramId } = d.indstillinger;
      const r =
        platform === "facebook"
          ? await d.meta.facebookStory(sideId, noegle, billede)
          : await d.meta.instagramStory(instagramId, noegle, billede);
      await afslut(d.db, dato, slot, platform, "lagt", r.id, null);
      res.platforme.push({ platform, status: "lagt" });
    } catch (e) {
      const besked = e instanceof Error ? e.message : "Ukendt fejl";
      await afslut(d.db, dato, slot, platform, "fejl", null, besked);
      res.platforme.push({ platform, status: "fejl", besked });
    }
  }
  return res;
}
