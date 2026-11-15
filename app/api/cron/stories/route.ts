// Stories på Facebook og Instagram. Vercel kalder ruten hver time kl. xx.25
// (vercel.json); ruten tjekker selv, om klokken er 8 eller 16 dansk tid, og
// gør ellers ingenting. Hele logikken ligger i lib/stories/koersel.ts.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { siteUrl } from "@/lib/site-url";
import { koerStories, laesIndstillinger } from "@/lib/stories/koersel";
import { opretMeta } from "@/lib/stories/meta";
import { hentShowsTilStories } from "@/lib/stories/kilder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Instagram skal have tid til at hente billedet (op til ca. 30 sekunder).
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
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
    return NextResponse.json(res);
  } catch (e) {
    // Fx at tabellen story_log ikke findes endnu. Vises også på /admin/stories.
    console.error("Stories-kørslen fejlede", e instanceof Error ? e.message : "");
    return NextResponse.json({ error: "Kørslen fejlede" }, { status: 500 });
  }
}
