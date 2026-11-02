// Annullering af betalte bookinger (personalet, /admin/opslag).
//
// Reglerne og rækkefølgen ligger her, så de kan efterprøves uden Airtable og
// database. Selve kaldene sættes sammen i app/api/admin/annuller/route.ts.
//
// Rækkefølge: 1) tjek status, 2) sæt status og note i Airtable, 3) frigiv
// pladserne. Går 2 galt, røres pladserne ikke. Går 3 galt, står bookingen som
// annulleret, og personalet får besked om, at pladserne mangler at blive
// frigivet. Frigivelsen kan gentages uden skade.
//
// Der refunderes intet, og kunden får ingen mail.

import { FIELDS } from "@/lib/airtable";

export const STATUS_ANNULLERET = "Annulleret";
const STATUS_BETALT = "Betalt";

function statusTekst(status: unknown): string {
  if (status && typeof status === "object" && "name" in (status as object)) {
    return String((status as { name?: unknown }).name ?? "");
  }
  return typeof status === "string" ? status : "";
}

/** Står bookingen som annulleret? Tåler både tekst og Airtable-objekt. */
export function erAnnulleret(status: unknown): boolean {
  return statusTekst(status) === STATUS_ANNULLERET;
}

export type Vurdering = { ok: true } | { ok: false; status: number; error: string };

/** Kun betalte bookinger kan annulleres, og kun én gang. */
export function vurderAnnullering(status: unknown): Vurdering {
  const s = statusTekst(status);
  if (s === STATUS_BETALT) return { ok: true };
  if (s === STATUS_ANNULLERET) {
    return { ok: false, status: 409, error: "Bookingen er allerede annulleret." };
  }
  return {
    ok: false,
    status: 409,
    error:
      "Kun betalte bookinger kan annulleres. Denne booking står ikke som betalt, så der er ikke noget at refundere.",
  };
}

export interface Refusion {
  kr: number;
  /** viva = summen af betalingerne i ledgeren; airtable = feltet "Betalt i alt"; ingen = intet betalt. */
  kilde: "viva" | "airtable" | "ingen";
}

/**
 * Beløbet, personalet skal refundere manuelt i Viva: summen af bookingens
 * betalte betalinger (billetkøb og genbestilte drikkevarer). Findes ingen, bruges
 * "Betalt i alt" fra Airtable. En fribillet giver 0 kr.
 */
export function beregnRefusion(p: { betaltOre: number[]; betaltIAlt: number | null }): Refusion {
  const ore = p.betaltOre.filter((o) => Number.isFinite(o) && o > 0).reduce((a, b) => a + b, 0);
  if (ore > 0) return { kr: Math.round(ore) / 100, kilde: "viva" };
  const kr = typeof p.betaltIAlt === "number" && Number.isFinite(p.betaltIAlt) ? p.betaltIAlt : 0;
  if (kr > 0) return { kr, kilde: "airtable" };
  return { kr: 0, kilde: "ingen" };
}

const NOTE_FORMAT = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "Annulleret af personale 02-11-2026 kl. 13.30. Husk refusion i Viva." (dansk tid) */
export function noteLinje(nu: Date): string {
  const d: Record<string, string> = {};
  for (const part of NOTE_FORMAT.formatToParts(nu)) d[part.type] = part.value;
  return `Annulleret af personale ${d.day}-${d.month}-${d.year} kl. ${d.hour}.${d.minute}. Husk refusion i Viva.`;
}

/** Lægger linjen til det, der står i forvejen (adskilt med " | " som systemets øvrige noter). */
export function tilfoejNote(eksisterende: string | null | undefined, linje: string): string {
  const e = String(eksisterende ?? "").trim();
  return e ? `${e} | ${linje}` : linje;
}

/** Bordplan og gæsteliste tæller ikke annullerede bookinger med. */
export function udenAnnullerede<T extends { status: unknown }>(rows: T[]): T[] {
  return rows.filter((r) => !erAnnulleret(r.status));
}

export interface AnnullerDeps {
  hentBooking(id: string): Promise<{ id: string; fields: Record<string, unknown> } | null>;
  opdaterBooking(id: string, felter: Record<string, unknown>): Promise<void>;
  /** Betalte beløb (øre) for bookingen i betalingsledgeren. */
  hentBetaltOre(id: string): Promise<number[]>;
  frigivPladser(id: string): Promise<void>;
  nu(): Date;
  log(besked: string, ctx?: Record<string, unknown>): void;
}

export type AnnullerSvar =
  | { ok: true; bookingNo: string; beloebKr: number; beloebKilde: Refusion["kilde"]; pladserFrigivet: boolean }
  | {
      ok: false;
      status: number;
      error: string;
      /** Kun ved en gentagelse på en allerede annulleret booking: lykkedes det at frigive pladserne? */
      pladserFrigivet?: boolean;
    };

export async function annullerBooking(deps: AnnullerDeps, bookingId: string): Promise<AnnullerSvar> {
  const booking = await deps.hentBooking(bookingId);
  if (!booking) {
    return { ok: false, status: 404, error: "Bookingen findes ikke." };
  }
  const f = booking.fields;
  const bookingNo = String(f[FIELDS.booking.bookingNo] ?? "");

  const vurdering = vurderAnnullering(f[FIELDS.booking.status]);
  if (!vurdering.ok) {
    // En booking, der allerede er annulleret, kan have pladser, der blev
    // hængende, hvis frigivelsen fejlede første gang. Frigivelsen er
    // skadesløs at gentage, så den prøves igen. Svaret er stadig en afvisning.
    if (erAnnulleret(f[FIELDS.booking.status])) {
      let pladserFrigivet = true;
      try {
        await deps.frigivPladser(bookingId);
      } catch {
        pladserFrigivet = false;
        deps.log("Annullering: pladserne kunne ikke frigives ved gentagelse", { bookingNo });
      }
      return { ...vurdering, pladserFrigivet };
    }
    return vurdering;
  }

  // Beløbet findes før ændringen, så et svigt aldrig efterlader en halv annullering.
  let betaltOre: number[] = [];
  try {
    betaltOre = await deps.hentBetaltOre(bookingId);
  } catch {
    deps.log("Annullering: ledgeren kunne ikke læses, bruger Betalt i alt", { bookingNo });
  }
  const betaltFelt = f[FIELDS.booking.totalPaid];
  const refusion = beregnRefusion({
    betaltOre,
    betaltIAlt: typeof betaltFelt === "number" ? betaltFelt : null,
  });

  try {
    await deps.opdaterBooking(bookingId, {
      [FIELDS.booking.status]: STATUS_ANNULLERET,
      [FIELDS.booking.specialRequests]: tilfoejNote(
        String(f[FIELDS.booking.specialRequests] ?? ""),
        noteLinje(deps.nu())
      ),
    });
  } catch {
    deps.log("Annullering: Airtable kunne ikke opdateres", { bookingNo });
    return {
      ok: false,
      status: 502,
      error: "Bookingen kunne ikke annulleres lige nu, og intet er ændret. Prøv igen om lidt.",
    };
  }

  let pladserFrigivet = true;
  try {
    await deps.frigivPladser(bookingId);
  } catch {
    pladserFrigivet = false;
    deps.log("Annullering: bookingen er annulleret, men pladserne blev ikke frigivet", { bookingNo });
  }
  deps.log("Booking annulleret af personale", { bookingNo, beloebKr: refusion.kr, pladserFrigivet });

  return { ok: true, bookingNo, beloebKr: refusion.kr, beloebKilde: refusion.kilde, pladserFrigivet };
}

export type FuldfoerSvar<T> = { udfoert: true; resultat: T } | { udfoert: false };

/**
 * Værn for Vivas webhook. En betaling må ALDRIG ændre en booking, der står som
 * "Annulleret": hverken sætte den til "Betalt", tage pladserne igen, lægge
 * drikkevarer på eller sende en ny billet. Det kan ellers ske, hvis en tidligere
 * behandling blev rullet tilbage, og Viva sender beskeden igen.
 *
 * Kan statussen ikke læses, kastes fejlen. Så svarer webhooken 500, og Viva
 * prøver igen senere (samme vej som alle andre fejl i webhooken).
 */
export async function fuldfoerKunHvisAktiv<T>(
  hentStatus: () => Promise<unknown>,
  fuldfoer: () => Promise<T>
): Promise<FuldfoerSvar<T>> {
  if (erAnnulleret(await hentStatus())) return { udfoert: false };
  return { udfoert: true, resultat: await fuldfoer() };
}
