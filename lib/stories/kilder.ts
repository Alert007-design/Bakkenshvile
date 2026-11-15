// Forestillinger til stories: datoer fra Airtable (den cachede læsning) og
// ledige pladser fra vores egen database, kun for i dag og i morgen. Samme
// tal som billetkøbet viser. Kan antallet ikke hentes, bliver det null, og så
// laves der ingen pladsstory (hellere ingen end en forkert).

import { listShowDates, danishToday } from "@/lib/events";
import { getDb } from "@/lib/db";
import { frigivUdloebne, hentTagne } from "@/lib/seat-holds";
import { KAPACITETSKATEGORIER, byggOversigt, kapaciteterFor } from "@/lib/kapacitet";
import { plusDage, type ShowInfo } from "./plan";

export async function hentShowsTilStories(): Promise<ShowInfo[]> {
  const iDag = danishToday();
  const fra = plusDage(iDag, -20);
  const iMorgen = plusDage(iDag, 1);
  const alle = (await listShowDates({ includePast: true })).filter((s) => s.date >= fra);

  const ud: ShowInfo[] = [];
  for (const s of alle) {
    let tilbage: number | null = null;
    if (s.date === iDag || s.date === iMorgen) {
      try {
        const db = getDb();
        await frigivUdloebne(db, s.id);
        const o = byggOversigt({
          kapaciteter: kapaciteterFor(s.kapacitetsjustering),
          tagne: await hentTagne(db, s.id),
          manueltUdsolgt: s.soldOut,
        });
        tilbage = KAPACITETSKATEGORIER.reduce((sum, k) => sum + Math.max(0, o[k].tilbage), 0);
      } catch {
        tilbage = null;
      }
    }
    ud.push({ date: s.date, time: s.time, tilbage, soldOut: s.soldOut });
  }
  return ud;
}
