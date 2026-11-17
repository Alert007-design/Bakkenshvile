// Stories på Facebook og Instagram. Vercel kalder ruten hver time kl. xx.25
// (vercel.json); ruten tjekker selv, om klokken er 8 eller 16 dansk tid, og
// gør ellers ingenting. Hele logikken ligger i lib/stories/koersel.ts.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { siteUrl } from "@/lib/site-url";
import { koerStories, laesIndstillinger, loglinjer } from "@/lib/stories/koersel";
import { opretMeta } from "@/lib/stories/meta";
import { hentShowsTilStories } from "@/lib/stories/kilder";
import { CRON_MANGLER_BESKED, tjekCronAdgang } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Instagram skal have tid til at hente billedet (op til ca. 35 sekunder).
// Ikke færdig inden da: rækken gemmes som "venter" og udgives næste time.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const adgang = tjekCronAdgang(req.headers.get("authorization"), process.env);
  if (adgang !== "ok") {
    // Fejlen skal kunne ses i Vercels log, så den ikke går ubemærket hen.
    console.error(adgang === "mangler-hemmelighed" ? `Stories: ${CRON_MANGLER_BESKED}` : "Stories: kald afvist (forkert nøgle)");
    return NextResponse.json({ error: "Uautoriseret" }, { status: 401 });
  }
  try {
    const res = await koerStories({
      db: getDb(),
      now: new Date(),
      hentShows: hentShowsTilStories,
      meta: opretMeta(),
      indstillinger: laesIndstillinger(process.env),
      billedUrl: (slot, dato) => `${siteUrl()}/stories/billede/${slot}/${dato}.jpg`,
    });
    if (res.fejl) console.error(`Stories: ${res.fejl}`);
    // Én linje pr. kørsel på et story-tidspunkt, og én pr. ventende række, der blev
    // tjekket. Fejlbeskeden står med, fx instagram=fejl(<besked>), men aldrig nøglen.
    for (const linje of loglinjer(res, String(process.env.META_PAGE_TOKEN ?? "").trim())) console.log(linje);
    return NextResponse.json(res);
  } catch (e) {
    // Fx at tabellen story_log ikke findes endnu. Vises også på /admin/stories.
    console.error("Stories-kørslen fejlede", e instanceof Error ? e.message : "");
    return NextResponse.json({ error: "Kørslen fejlede" }, { status: 500 });
  }
}
