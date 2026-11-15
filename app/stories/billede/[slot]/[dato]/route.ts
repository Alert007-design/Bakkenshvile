// Story-billedet som JPEG. Meta henter det herfra, når en story lægges op,
// og /admin/stories viser det som forhåndsvisning. Offentligt, fordi Meta
// skal kunne hente det uden login; billedet er alligevel offentligt bagefter.
// Kun i går, i dag og i morgen kan vises, så adressen ikke kan bruges til at
// fremprovokere mange tunge kald.

import { NextRequest, NextResponse } from "next/server";
import { danishToday } from "@/lib/events";
import { plusDage, vaelgStory, SLOTS, type Slot } from "@/lib/stories/plan";
import { hentShowsTilStories } from "@/lib/stories/kilder";
import { tegnStory } from "@/lib/stories/billede";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slot: string; dato: string } }
) {
  const slot = params.slot as Slot;
  const dato = params.dato.replace(/\.jpg$/, "");
  const iDag = danishToday();
  const tilladt = [plusDage(iDag, -1), iDag, plusDage(iDag, 1)];
  if (!SLOTS.includes(slot) || !tilladt.includes(dato)) {
    return NextResponse.json({ error: "Findes ikke." }, { status: 404 });
  }
  try {
    const story = vaelgStory(slot, dato, await hentShowsTilStories());
    if (!story) return NextResponse.json({ error: "Ingen story." }, { status: 404 });
    const jpg = await tegnStory(story);
    return new NextResponse(new Uint8Array(jpg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch {
    console.error("Kunne ikke tegne story-billedet");
    return NextResponse.json({ error: "Kunne ikke tegne billedet." }, { status: 500 });
  }
}
