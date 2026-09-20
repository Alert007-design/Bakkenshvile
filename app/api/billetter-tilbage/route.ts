// Hvor mange billetter er der tilbage i hver priskategori for én forestilling?
//
// Kaldes af /book, når kunden har valgt en dato — og igen, når datoen skiftes.
//
// Airtables grænse på 5 kald i sekundet er der taget højde for: kapaciteten
// (standardtal eller ejerens justering) kommer fra den CACHEDE læsning af
// forestillingerne, som /book alligevel laver, mens selve "hvor mange er
// taget"-tallene kommer fra vores egen database. Der sker altså ingen ekstra
// Airtable-kald pr. besøgende.
//
// Svaret må aldrig caches: tallene skal være friske.

import { NextRequest, NextResponse } from "next/server";
import { getShowDate } from "@/lib/events";
import { getDb } from "@/lib/db";
import { frigivUdloebne, hentTagne } from "@/lib/seat-holds";
import {
  KAPACITETSKATEGORIER,
  byggOversigt,
  kapaciteterFor,
} from "@/lib/kapacitet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const showId = req.nextUrl.searchParams.get("showId") ?? "";
  if (!showId) {
    return NextResponse.json({ error: "Mangler forestilling." }, { status: 400 });
  }

  try {
    const show = await getShowDate(showId);
    if (!show) {
      return NextResponse.json(
        { error: "Forestillingen findes ikke." },
        { status: 404 }
      );
    }

    const db = getDb();
    // Giv udløbne reservationer tilbage, før der tælles — så ingen ser
    // "Udsolgt" på pladser, ingen længere holder.
    await frigivUdloebne(db, show.id);
    const oversigt = byggOversigt({
      kapaciteter: kapaciteterFor(show.kapacitetsjustering),
      tagne: await hentTagne(db, show.id),
      manueltUdsolgt: show.soldOut,
    });

    return NextResponse.json(
      {
        showId: show.id,
        // Kun "tilbage" sendes til browseren. Kapacitet og solgte tal er
        // driftsoplysninger, gæsterne ikke skal kunne aflæse.
        tilbage: Object.fromEntries(
          KAPACITETSKATEGORIER.map((k) => [k, oversigt[k].tilbage])
        ),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("Kunne ikke hente antal billetter tilbage");
    return NextResponse.json(
      { error: "Kunne ikke hente antal billetter tilbage." },
      { status: 500 }
    );
  }
}
