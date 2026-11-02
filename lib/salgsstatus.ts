// Salgsstatus for alle kommende forestillinger: hvad er solgt, hvad er
// reserveret (ikke betalt endnu), og hvad er stadig til salg.
//
// Ren regnefil — tallene sendes ind, så reglerne kan efterprøves i
// lib/salgsstatus.test.ts. Selve hentningen sker i app/api/admin/salgsstatus.
//
// Regler:
//  - "Solgt" er pladser, der er betalt (eller givet som fribillet).
//  - "Reserveret" er pladser, der holdes uden at være betalt: store selskaber,
//    køb, der er midt i betalingen, og gamle bookinger, der mangler betaling.
//  - "Til salg" regnes som i resten af sitet (kapacitet minus optaget), og
//    udsolgt-fluebenet i Airtable giver altid nul til salg.

import {
  KAPACITETSKATEGORIER,
  byggOversigt,
  type Kapacitetskategori,
} from "@/lib/kapacitet";

type Pladstal = Record<Kapacitetskategori, number>;

export interface HoldLinje {
  showId: string;
  bookingId: string;
  kategori: Kapacitetskategori;
  antal: number;
  status: "held" | "sold";
}

const nul = (): Pladstal => ({ aplusForrest: 0, aplusBagerst: 0, a: 0, b: 0 });

/**
 * Fordeler pladsbogens linjer på solgt og reserveret pr. forestilling.
 * `ubetalte` er booking-id'er fra det gamle system, der mangler betaling.
 */
export function fordelSalg(
  holds: HoldLinje[],
  ubetalte: Set<string>
): Map<string, { solgt: Pladstal; reserveret: Pladstal }> {
  const ud = new Map<string, { solgt: Pladstal; reserveret: Pladstal }>();
  for (const h of holds) {
    if (!KAPACITETSKATEGORIER.includes(h.kategori)) continue;
    if (!Number.isInteger(h.antal) || h.antal <= 0) continue;
    let tal = ud.get(h.showId);
    if (!tal) {
      tal = { solgt: nul(), reserveret: nul() };
      ud.set(h.showId, tal);
    }
    const reserveret = h.status === "held" || ubetalte.has(h.bookingId);
    (reserveret ? tal.reserveret : tal.solgt)[h.kategori] += h.antal;
  }
  return ud;
}

export interface Statustal {
  kapacitet: number;
  solgt: number;
  reserveret: number;
  tilSalg: number;
}

export interface Statuslinje {
  kategorier: Record<Kapacitetskategori, Statustal>;
  iAlt: Statustal;
}

export function byggStatuslinje(params: {
  kapaciteter: Pladstal;
  /** Optaget i alt pr. kategori (pladsbogens tællere). */
  tagne: Pladstal;
  solgt: Pladstal;
  reserveret: Pladstal;
  manueltUdsolgt: boolean;
}): Statuslinje {
  const oversigt = byggOversigt({
    kapaciteter: params.kapaciteter,
    tagne: params.tagne,
    manueltUdsolgt: params.manueltUdsolgt,
  });
  const kategorier = {} as Record<Kapacitetskategori, Statustal>;
  const iAlt: Statustal = { kapacitet: 0, solgt: 0, reserveret: 0, tilSalg: 0 };
  for (const k of KAPACITETSKATEGORIER) {
    const t: Statustal = {
      kapacitet: oversigt[k].kapacitet,
      solgt: params.solgt[k],
      reserveret: params.reserveret[k],
      tilSalg: oversigt[k].tilbage,
    };
    kategorier[k] = t;
    iAlt.kapacitet += t.kapacitet;
    iAlt.solgt += t.solgt;
    iAlt.reserveret += t.reserveret;
    iAlt.tilSalg += t.tilSalg;
  }
  return { kategorier, iAlt };
}
