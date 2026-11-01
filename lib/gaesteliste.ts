// Aftenens gæsteliste på bordplanen: faste gæstenumre, opdeling på
// billetkategorier, sortering og kundens egne bemærkninger.
//
// Ren regnefil — ingen Airtable, ingen database. Alt sendes ind, så reglerne
// kan efterprøves i lib/gaesteliste.test.ts.
//
// Regler (besluttet af ejeren 01-11-2026):
//  - Hver booking får et gæstenummer pr. aften efter bestillingstidspunktet.
//  - Samme mail samme dag (dansk tid) giver samme nummer.
//  - Et nummer ændres aldrig, når det først er givet. Slettes en booking,
//    mangler nummeret bare; der fyldes ikke op.

/** Bookingstatusser, der får et gæstenummer. */
const STATUSER_MED_NUMMER = new Set(["Betalt", "Ekstra – afventer betaling"]);

export const UKENDT_KATEGORI = "Ukendt kategori";

/** Får en booking med denne status et gæstenummer? */
export function faarNummer(status: string): boolean {
  return STATUSER_MED_NUMMER.has(status);
}

const DAG_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Copenhagen",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Kalenderdagen (ÅÅÅÅ-MM-DD) i dansk tid for et tidspunkt. */
export function dagIKoebenhavn(iso: string): string {
  return DAG_FORMAT.format(new Date(iso));
}

export interface NummerBooking {
  id: string;
  email: string;
  /** Bestillingstidspunkt, ISO-tekst. */
  bestilt: string;
  gaestenummer: number | null;
  status: string;
}

function nogle(email: string, bestilt: string): string | null {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  return `${e}|${dagIKoebenhavn(bestilt)}`;
}

/** Først bestilte først; ved samme tidspunkt afgør id'et, så rækkefølgen er fast. */
export function sorterEfterBestilt<T extends { id: string; bestilt: string }>(liste: T[]): T[] {
  return [...liste].sort((a, b) => {
    const forskel = Date.parse(a.bestilt) - Date.parse(b.bestilt);
    if (forskel !== 0 && !Number.isNaN(forskel)) return forskel;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Finder gæstenumre til de bookinger på én aften, der endnu ikke har ét.
 * Returnerer KUN de nye numre (booking-id → nummer); eksisterende røres ikke.
 */
export function tildelGaestenumre(bookinger: NummerBooking[]): Map<string, number> {
  const kendte = new Map<string, number>();
  let hoejeste = 0;
  for (const b of bookinger) {
    if (b.gaestenummer === null) continue;
    hoejeste = Math.max(hoejeste, b.gaestenummer);
    const k = nogle(b.email, b.bestilt);
    if (k && !kendte.has(k)) kendte.set(k, b.gaestenummer);
  }

  const nye = new Map<string, number>();
  const mangler = sorterEfterBestilt(
    bookinger.filter((b) => b.gaestenummer === null && faarNummer(b.status))
  );
  for (const b of mangler) {
    const k = nogle(b.email, b.bestilt);
    const genbrug = k ? kendte.get(k) : undefined;
    if (genbrug !== undefined) {
      nye.set(b.id, genbrug);
      continue;
    }
    hoejeste += 1;
    nye.set(b.id, hoejeste);
    if (k) kendte.set(k, hoejeste);
  }
  return nye;
}

export interface Kategoridel {
  kategori: string;
  antal: number;
}

/**
 * Deler billetnedbrydningen ("A+ (1.-2.-3. række) x2, B (10. række) x1") op i
 * kategorier. Kan teksten ikke læses, bliver hele bookingen én ukendt kategori,
 * så ingen gæster forsvinder fra listen.
 */
export function delPaaKategorier(nedbrydning: string, antalIAlt: number): Kategoridel[] {
  const dele = new Map<string, number>();
  for (const stykke of nedbrydning.split(",")) {
    const s = stykke.trim();
    if (!s) continue;
    const m = s.match(/^(.+?)\s+x(\d+)$/);
    if (!m) return [{ kategori: UKENDT_KATEGORI, antal: antalIAlt }];
    const kategori = m[1].trim();
    dele.set(kategori, (dele.get(kategori) ?? 0) + Number(m[2]));
  }
  if (dele.size === 0) return [{ kategori: UKENDT_KATEGORI, antal: antalIAlt }];
  return Array.from(dele.entries()).map(([kategori, antal]) => ({ kategori, antal }));
}

// Tekster, som systemet selv skriver i "Særlige ønsker" — ikke kundens egne.
const SYSTEMTEKST = /^(overført fra|fra) ticketcloud\b/i;

/**
 * Kundens egen bemærkning fra feltet "Særlige ønsker", uden systemets tekster.
 * Tom tekst betyder: ingen stjerne.
 */
export function kundeBemaerkning(saerligeOensker: string | undefined | null): string {
  const tekst = String(saerligeOensker ?? "").trim();
  if (!tekst) return "";
  const dele: string[] = [];
  for (const raa of tekst.split(" | ")) {
    let s = raa.trim();
    if (!s || SYSTEMTEKST.test(s)) continue;
    // Nye køb: "Show: <dato> — <kundens ønsker>".
    if (s.startsWith("Show:")) {
      const i = s.indexOf(" — ");
      if (i === -1) continue;
      s = s.slice(i + 3).trim();
    }
    // Fribilletter og ekstrabilletter: kun noten, mærket vises allerede.
    const m = s.match(/^(Fribillet|Ekstrabillet)(\s*[—–-]\s*([\s\S]*))?$/);
    if (m) s = (m[3] ?? "").trim();
    if (s) dele.push(s);
  }
  return dele.join(" · ");
}
