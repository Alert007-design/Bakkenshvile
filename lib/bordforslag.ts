// Forslag til bordplacering på /admin. Det er KUN et forslag: personalet
// flytter frit rundt på dagen, fordi den endelige placering afhænger af,
// hvordan selskaberne faktisk ser ud.
//
// Regler (besluttet af ejeren 31-10-2026, ændret 01-11-2026):
//  - Højst 5 personer ved ét bord.
//  - Et selskab på mere end 5 fylder et bord med 5 og sætter resten ved
//    nabobordet: 6 = 5+1, 7 = 5+2, 11 = 5+5+1.
//  - Sidder én fra et stort selskab alene ved nabobordet, sættes et selskab
//    på 2 (ellers 3) ved samme bord.
//  - Enlige sættes sammen med andre enlige i samme kategori ved et bord med
//    et selskab på 2 (højst 3 enlige), ellers på 3 (højst 2 enlige). Er der
//    hverken par eller selskaber på 3, sidder de enlige sammen.
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

/** Deler et stort selskab: fulde borde med 5 og resten ved nabobordet. */
export function delIBorde(antal: number, maks = MAKS_PR_BORD): number[] {
  if (antal <= 0) return [];
  const ud: number[] = [];
  let rest = antal;
  while (rest > 0) {
    ud.push(Math.min(maks, rest));
    rest -= maks;
  }
  return ud;
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

  function optaget(b: BordIForslag<R>): number {
    return b.pladser.reduce((s, p) => s + p.antal, 0);
  }

  // Tager det selskab fra listen, der passer bedst til dem, der allerede
  // sidder ved bordet (matchsvarene). Ved lige godt vinder den første.
  function taBedste(liste: R[], ved: R[]): R | undefined {
    if (liste.length === 0) return undefined;
    let bedst = 0;
    let score = -Infinity;
    liste.forEach((r, i) => {
      const s = ved.reduce((sum, v) => sum + affinity(r, v), 0);
      if (s > score) {
        score = s;
        bedst = i;
      }
    });
    return liste.splice(bedst, 1)[0];
  }

  for (const [kategori, rows] of grupper) {
    const aktive = rows.filter((r) => r.ticketCount > 0);
    const store = aktive
      .filter((r) => r.ticketCount > MAKS_PR_BORD)
      .sort((a, b) => b.ticketCount - a.ticketCount);
    const enlige = aktive.filter((r) => r.ticketCount === 1);
    const par = aktive.filter((r) => r.ticketCount === 2);
    const tre = aktive.filter((r) => r.ticketCount === 3);
    const aabne: BordIForslag<R>[] = [];

    // 1. Store selskaber først, så de får borde ved siden af hinanden.
    //    Resten af selskabet ved nabobordet er et åbent bord, andre kan
    //    sættes ved.
    for (const r of store) {
      const dele = delIBorde(r.ticketCount);
      const borde = nabobord(kategori, dele.length);
      borde.forEach((b, i) => b.pladser.push({ row: r, antal: dele[i] }));
      resultat.push(...borde);
      const sidste = borde[borde.length - 1];
      if (dele[dele.length - 1] < MAKS_PR_BORD) aabne.push(sidste);
    }

    // 2. Sidder én fra et stort selskab alene, får bordet et par, ellers tre.
    for (const b of aabne) {
      if (optaget(b) !== 1) continue;
      const ved = b.pladser.map((p) => p.row);
      const gaest = taBedste(par, ved) ?? taBedste(tre, ved);
      if (gaest) b.pladser.push({ row: gaest, antal: gaest.ticketCount });
    }

    // 3. Enlige: ved et bord med et par (højst 3 enlige), ellers med et
    //    selskab på 3 (højst 2 enlige), ellers enlige sammen (højst 5).
    while (enlige.length > 0) {
      const foerste = enlige.shift()!;
      const vaert = taBedste(par, [foerste]) ?? taBedste(tre, [foerste]);
      const bord = nytBord(kategori);
      bord.pladser.push({ row: foerste, antal: 1 });
      if (vaert) bord.pladser.push({ row: vaert, antal: vaert.ticketCount });
      while (enlige.length > 0 && optaget(bord) < MAKS_PR_BORD) {
        const ved = bord.pladser.map((p) => p.row);
        const naeste = taBedste(enlige, ved)!;
        bord.pladser.push({ row: naeste, antal: 1 });
      }
      aabne.push(bord);
      resultat.push(bord);
    }

    // 4. Resten (par og selskaber på 3 uden enlige, og selskaber på 4-5):
    //    ved det bord, hvor de passer bedst, ellers et nyt.
    const smaa = [...par, ...tre, ...aktive.filter((r) => r.ticketCount >= 4 && r.ticketCount <= MAKS_PR_BORD)]
      // Størst først. Ved lige store kommer selskaber med samme matchsvar
      // lige efter hinanden, så de lander ved samme bord.
      .sort(
        (a, b) =>
          b.ticketCount - a.ticketCount || matchNoegle(a).localeCompare(matchNoegle(b))
      );
    for (const r of smaa) {
      let bedst: BordIForslag<R> | null = null;
      // Et selskab, der gerne vil matches, får hellere sit eget bord end at
      // blive sat sammen med nogen, der også vil matches, men intet har til
      // fælles. Andre fylder bare op, hvor der er plads.
      let bedstScore = r.wantsMatching ? -0.5 : -Infinity;
      for (const b of aabne) {
        const o = optaget(b);
        if (o + r.ticketCount > MAKS_PR_BORD) continue;
        let score = 0;
        let uenig = false;
        for (const p of b.pladser) {
          const a = affinity(r, p.row);
          score += a;
          if (a === 0 && r.wantsMatching && p.row.wantsMatching) uenig = true;
        }
        if (uenig && score === 0) score -= 1;
        score += o * 0.01; // let præference for at fylde bordet op
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
