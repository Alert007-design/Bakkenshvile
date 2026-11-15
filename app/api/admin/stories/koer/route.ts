// "Læg op nu" fra /admin/stories: kører dagens story for et tidspunkt med
// det samme i stedet for at vente på cron. Samme regler som cron: kun i live,
// kun godkendte skabeloner, og højst én gang pr. dag og platform.

import { NextRequest, NextResponse } from "next/server";
import { verifyStaffSession, verifyCsrf, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import { getDb } from "@/lib/db";
import { siteUrl } from "@/lib/site-url";
import { koerStories, laesIndstillinger } from "@/lib/stories/koersel";
import { opretMeta } from "@/lib/stories/meta";
import { hentShowsTilStories } from "@/lib/stories/kilder";
import { SLOTS, type Slot } from "@/lib/stories/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const s = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!s) return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  if (!verifyCsrf(s, req.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 403 });
  }
  const body = ((await req.json().catch(() => ({}))) ?? {}) as { slot?: string };
  const slot = body.slot as Slot;
  if (!SLOTS.includes(slot)) {
    return NextResponse.json({ error: "Ukendt tidspunkt." }, { status: 400 });
  }
  try {
    const res = await koerStories({
      db: getDb(),
      now: new Date(),
      hentShows: hentShowsTilStories,
      meta: opretMeta(),
      indstillinger: laesIndstillinger(process.env),
      billedUrl: (sl, dato) => `${siteUrl()}/stories/billede/${sl}/${dato}.jpg`,
      tvingSlot: slot,
    });
    return NextResponse.json(res);
  } catch {
    console.error("Stories: manuel kørsel fejlede");
    return NextResponse.json({ error: "Kørslen fejlede. Se loggen." }, { status: 500 });
  }
}
