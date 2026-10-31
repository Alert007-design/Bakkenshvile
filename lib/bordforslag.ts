// Forslag til bordplacering på /admin. Det er KUN et forslag: personalet
// flytter frit rundt på dagen, fordi den endelige placering afhænger af,
// hvordan selskaberne faktisk ser ud.
//
// Regler (besluttet af ejeren 31-10-2026):
//  - Højst 5 personer ved ét bord.
//  - Et selskab på mere end 5 deles ligeligt på borde ved siden af hinanden,
//    fx 6 = 3+3, 8 = 4+4, 11 = 4+4+3 (aldrig 5+1).
//  - Mindre selskaber kan dele bord, hvis de passer ind; matchsvarene
//    (alder, egn, drikkevarer, interesser) afgør, hvem der sidder sammen.
//  - Borde tildeles med salens rigtige numre (lib/tables.ts) inden for den
//    del af salen, billetkategorien hører til: A+ forrest = række 1-3,
//    A+ bagerst = række 4-6, A = række 7-9, B = række 10 og bord 94.

import { TABLES, type TableDef } from "@/lib/tables";

export const MAKS_PR_BORD = 5;

export interface ForslagBooking {
  id: string;
  ticketCount: number;
  wantsMatching: boolean;
  ageGroup: string;
  location: string;
  interests: string;
  drinkPreference: string;
}

export interface BordIForslag<R extends ForslagBooking> {
  /** Salens bordnummer, eller null hvis salen er løbet tør for borde. */
  table: number | null;
  /** Vises i forslaget, fx "Bord 21" eller "Ekstra bord 1". */
  label: string;
  category: string;
  /** Hvem sidder her, og hvor mange fra hvert selskab. */
  pladser: { row: R; antal: number }[];
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function interestTokens(s: string): string[] {
  return normalize(s)
    .split(/[,;/]| og /)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Hvor godt to selskaber passer sammen ved ét bord (kun ved ja til match). */
export function affinity(a: ForslagBooking, b: ForslagBooking): number {
  if (!a.wantsMatching || !b.wantsMatching) return 0;
  let score = 0;
  if (a.ageGroup && a.ageGroup === b.ageGroup) score += 3;
  if (a.location && normalize(a.location) === normalize(b.location)) score += 2;
  if (a.drinkPreference && a.drinkPreference === b.drinkPreference) score += 2;
  const bi = interestTokens(b.interests);
  score += Math.min(interestTokens(a.interests).filter((t) => bi.includes(t)).length, 3);
  return score;
}

function matchNoegle(r: ForslagBooking): string {
  // Bookinger uden ja til match sorteres sidst.
  if (!r.wantsMatching) return "~";
  return [r.ageGroup, normalize(r.location), r.drinkPreference].join("|");
}

/** Deler et antal personer ligeligt på så få borde som muligt (højst 5 pr. bord). */
export function delLigeligt(antal: number, maks = MAKS_PR_BORD): number[] {
  if (antal <= 0) return [];
  const borde = Math.ceil(antal / maks);
  const grund = Math.floor(antal / borde);
  const rest = antal % borde;
  return Array.from({ length: borde }, (_, i) => grund + (i < rest ? 1 : 0));
}

/** Hvilke rækker en billetkategori hører til. Null = ukendt kategori. */
export function raekkerFor(kategori: string): ((t: TableDef) => boolean) | null {
  const k = kategori.trim();
  if (k.startsWith("A+ (1")) return (t) => t.row >= 1 && t.row <= 3;
  if (k.startsWith("A+ (4")) return (t) => t.row >= 4 && t.row <= 6;
  if (k.startsWith("A+")) return (t) => t.row >= 1 && t.row <= 6;
  if (k.startsWith("A (") || k === "A") return (t) => t.category === "A";
  if (k.startsWith("B")) return (t) => t.category === "B";
  return null;
}

/**
 * Laver forslaget. `grupper` er bookingerne pr. billetkategori i den
 * rækkefølge, salen skal fyldes (dyreste først).
 */
export function lavBordforslag<R extends ForslagBooking>(
  grupper: [string, R[]][]
): BordIForslag<R>[] {
  const brugt = new Set<number>();
  let ekstra = 0;
  const resultat: BordIForslag<R>[] = [];

  // Næste ledige bord i kategoriens del af salen. Findes der ingen, bruges et
  // ledigt bord hvor som helst; er salen fuld, laves et "ekstra bord".
  function ledigeBorde(kategori: string): TableDef[] {
    const filter = raekkerFor(kategori);
    const egne = TABLES.filter((t) => !brugt.has(t.number) && (!filter || filter(t)));
    return egne.length > 0 ? egne : TABLES.filter((t) => !brugt.has(t.number));
  }

  function nytBord(kategori: string): BordIForslag<R> {
    const t = ledigeBorde(kategori)[0];
    if (t) {
      brugt.add(t.number);
      return { table: t.number, label: `Bord ${t.number}`, category: kategori, pladser: [] };
    }
    ekstra++;
    return { table: null, label: `Ekstra bord ${ekstra}`, category: kategori, pladser: [] };
  }

  // k borde ved siden af hinanden: helst i samme række og i træk.
  function nabobord(kategori: string, k: number): BordIForslag<R>[] {
    const ledige = ledigeBorde(kategori);
    for (let i = 0; i + k <= ledige.length; i++) {
      const run = ledige.slice(i, i + k);
      const sammeRaekke = run.every((t) => t.row === run[0].row);
      const iTraek = run.every((t, j) => j === 0 || t.position === run[j - 1].position + 1);
      if (sammeRaekke && iTraek) {
        run.forEach((t) => brugt.add(t.number));
        return run.map((t) => ({ table: t.number, label: `Bord ${t.number}`, category: kategori, pladser: [] }));
      }
    }
    // Ingen hel række ledig: tag de næste i salens rækkefølge.
    return Array.from({ length: k }, () => nytBord(kategori));
  }

  for (const [kategori, rows] of grupper) {
    const store = rows.filter((r) => r.ticketCount > MAKS_PR_BORD);
    const smaa = rows
      .filter((r) => r.ticketCount > 0 && r.ticketCount <= MAKS_PR_BORD)
      // Størst først. Ved lige store kommer selskaber med samme matchsvar
      // lige efter hinanden, så de lander ved samme bord.
      .sort(
        (a, b) =>
          b.ticketCount - a.ticketCount || matchNoegle(a).localeCompare(matchNoegle(b))
      );

    // Store selskaber først, så de får borde ved siden af hinanden.
    for (const r of [...store].sort((a, b) => b.ticketCount - a.ticketCount)) {
      const dele = delLigeligt(r.ticketCount);
      const borde = nabobord(kategori, dele.length);
      borde.forEach((b, i) => b.pladser.push({ row: r, antal: dele[i] }));
      resultat.push(...borde);
    }

    // Små selskaber: sæt ved det bord, hvor de passer bedst, ellers et nyt.
    const aabne: BordIForslag<R>[] = [];
    for (const r of smaa) {
      let bedst: BordIForslag<R> | null = null;
      // Et selskab, der gerne vil matches, får hellere sit eget bord end at
      // blive sat sammen med nogen, der også vil matches, men intet har til
      // fælles. Andre fylder bare op, hvor der er plads.
      let bedstScore = r.wantsMatching ? -0.5 : -Infinity;
      for (const b of aabne) {
        const optaget = b.pladser.reduce((s, p) => s + p.antal, 0);
        if (optaget + r.ticketCount > MAKS_PR_BORD) continue;
        let score = 0;
        let uenig = false;
        for (const p of b.pladser) {
          const a = affinity(r, p.row);
          score += a;
          if (a === 0 && r.wantsMatching && p.row.wantsMatching) uenig = true;
        }
        if (uenig && score === 0) score -= 1;
        score += optaget * 0.01; // let præference for at fylde bordet op
        if (score > bedstScore) {
          bedstScore = score;
          bedst = b;
        }
      }
      if (!bedst) {
        bedst = nytBord(kategori);
        aabne.push(bedst);
        resultat.push(bedst);
      }
      bedst.pladser.push({ row: r, antal: r.ticketCount });
    }
  }
  return resultat;
}

/** Bordteksten, der gemmes på en booking: "21" eller "21+22" ved et delt selskab. */
export function bordTekstPrBooking<R extends ForslagBooking>(
  forslag: BordIForslag<R>[]
): Map<string, string> {
  const m = new Map<string, string[]>();
  for (const b of forslag) {
    for (const p of b.pladser) {
      const liste = m.get(p.row.id) ?? [];
      liste.push(b.table === null ? b.label : String(b.table));
      m.set(p.row.id, liste);
    }
  }
  return new Map(Array.from(m.entries()).map(([id, l]) => [id, l.join("+")]));
}
