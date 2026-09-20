// Farverne på pladsoversigten i salen (SeatingChart i BookingClient.tsx).
//
// Eneste kilde til kategorifarverne. BÅDE sæderne, bogstaverne i venstre side
// og farveforklaringen nederst henter herfra, så de aldrig kan komme ud af
// trit med hinanden.
//
// Krav til farverne: hver af dem skal have mindst 3:1 i kontrast mod salens
// mørkeblå baggrund, og de fire kategorier skal kunne skelnes fra hinanden.
// Begge dele er bevogtet af lib/seating-colors.test.ts. Før denne omlægning
// var B (10. række) så mørk (#4E5F73), at den nærmest forsvandt i baggrunden.

/** De fire priskategorier, salen sælges i. A+ er to. */
export type Pladskategori = "aplusForrest" | "aplusBagerst" | "a" | "b";

/**
 * Baggrunden, farverne skal ses imod: sidens mørkeblå (--bh-navy, #0f1f33)
 * med det tynde creme-slør fra .seating-chart-wrap (3 % af #f6f1e4) lagt oven
 * på. De to lag er regnet sammen til én farve her, så kontrastkravet kan
 * efterprøves i en test.
 */
export const SAL_BAGGRUND = "#162538";

/** Kategorifarverne. Fire tydeligt forskellige farver, ikke fire nuancer. */
export const KATEGORI_FARVER: Record<Pladskategori, string> = {
  /** A+ 1.-3. række — lys guld. */
  aplusForrest: "#f2d16b",
  /** A+ 4.-6. række — kobber. */
  aplusBagerst: "#d9822b",
  /** A 7.-9. række — klar lyseblå. */
  a: "#6db3e8",
  /** B 10. række — lys grøn. */
  b: "#9ad1a3",
};

/**
 * Stolperne i salen. Neutral grå uden farvestik, så de tydeligt ikke ligner
 * en plads man kan sidde ved.
 */
export const STOLPE_FARVE = "#8c8c8c";

/** En linje i farveforklaringen nederst på oversigten. */
export interface Forklaringspost {
  noegle: Pladskategori | "stolpe";
  farve: string;
  tekst: string;
}

/**
 * Farveforklaringen, i den rækkefølge salen læses forfra og bagud. Farverne
 * hentes fra konstanterne ovenfor — aldrig skrevet af i hånden.
 */
export const FARVEFORKLARING: Forklaringspost[] = [
  {
    noegle: "aplusForrest",
    farve: KATEGORI_FARVER.aplusForrest,
    tekst: "A+ (1.-3. række)",
  },
  {
    noegle: "aplusBagerst",
    farve: KATEGORI_FARVER.aplusBagerst,
    tekst: "A+ (4.-6. række)",
  },
  { noegle: "a", farve: KATEGORI_FARVER.a, tekst: "A (7.-9. række)" },
  { noegle: "b", farve: KATEGORI_FARVER.b, tekst: "B (10. række)" },
  { noegle: "stolpe", farve: STOLPE_FARVE, tekst: "Stolpe" },
];
