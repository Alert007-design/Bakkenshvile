// Fælles layout for ALLE mails, sitet sender.
//
// Hvorfor tabeller og ikke almindelige div'er: Outlook på Windows tegner mails
// med Words gengivelsesmotor. Den ignorerer det meste moderne CSS — max-width,
// padding på div'er, baggrundsfarver på div'er, flexbox, grid og afrundede
// hjørner. Resultatet er en mail i fuld skærmbredde uden luft og uden rammer.
// Derfor er ALT her bygget som indlejrede tabeller med faste bredder,
// bgcolor-attributter på farvede celler og styles skrevet direkte på hvert
// element. Ingen webfonte og ingen billeder — Georgia findes på alle maskiner,
// og billeder blokeres ofte af mailprogrammet.
//
// Udseendet vedligeholdes KUN her. Hver enkelt mail leverer sit eget indhold
// til det hvide felt i midten og rører hverken sidehoved eller sidefod.

/** Husets farver, samlet ét sted så alle mails er ens. */
export const FARVER = {
  /** Mørkegrøn — sidehoved og overskrifter. */
  groen: "#0d3b2e",
  /** Guld — stribe under sidehovedet, rammer og accenter. */
  guld: "#c9a227",
  /** Sart creme — mailens yderste baggrund. */
  creme: "#f6f1e4",
  /** Lys creme — fremhævede felter inde i det hvide indhold. */
  cremeLys: "#fbf7ec",
  /** Næsten sort — almindelig brødtekst. */
  blaek: "#1a1a16",
  /** Dæmpet brun — mærkater og småt med gråt. */
  daempet: "#6b6858",
  /** Tynd streg i tabeller. */
  streg: "#e5e0d0",
} as const;

/** Skriften. Georgia findes på både Windows og Mac; ingen webfont hentes. */
export const SKRIFT = "Georgia,'Times New Roman',serif";

/** Husets adresse og kontaktadresse — står i sidefoden på hver mail. */
export const ADRESSE = "Bakkens Hvile, Dyrehavsbakken 38, 2930 Klampenborg";
export const KONTAKT_EMAIL = "kontor@bakkenshvile.dk";

/**
 * Gør tekst ufarlig at sætte ind i HTML.
 *
 * ALT, hvad en gæst selv har skrevet — navn, hilsen, e-mail, firmanavn — skal
 * igennem den her, før det havner i en mail. Ellers kan en gæst, der skriver
 * <script> i sit navn, få vilkårlig kode med ud i mailen.
 */
export function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface MailLayoutParams {
  /** Mailens titel (browserfanen, når mailen åbnes i en browser). */
  title: string;
  /**
   * Den skjulte forhåndstekst, indbakken viser efter emnelinjen. Skal være
   * dynamisk, fx bookingnummeret eller beløbet — ikke en fast sætning.
   */
  preheader: string;
  /** Færdigt HTML til det hvide indholdsfelt. Escapes IKKE (det er markup). */
  indhold: string;
}

/**
 * Pakker et stykke indhold ind i husets maildesign: sidehoved med grøn bjælke,
 * guldstribe, hvidt indholdsfelt og sidefod med adresse.
 */
export function mailLayout({ title, preheader, indhold }: MailLayoutParams): string {
  return `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(title)}</title>
<style>
  body { margin:0; padding:0; background:${FARVER.creme}; }
  table { border-collapse:collapse; }
  a { color:${FARVER.groen}; }
  @media only screen and (max-width:620px) {
    .bh-wrap { width:100% !important; }
    .bh-pad { padding:24px 18px !important; }
    .bh-outer { padding:0 !important; }
    .bh-big { font-size:40px !important; }
  }
  @media print {
    body, .bh-bg { background:#ffffff !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${FARVER.creme};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${FARVER.creme};">${escapeHtml(preheader)}</div>
<table role="presentation" class="bh-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${FARVER.creme}" style="background:${FARVER.creme};">
<tr><td class="bh-outer" align="center" style="padding:28px 12px;">

  <table role="presentation" class="bh-wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

    <!-- Sidehoved -->
    <tr><td align="center" bgcolor="${FARVER.groen}" style="background:${FARVER.groen};padding:30px 24px 26px;">
      <div style="font-family:${SKRIFT};font-size:13px;font-style:italic;color:${FARVER.guld};line-height:18px;">På Dyrehavsbakken siden 1877</div>
      <div style="font-family:${SKRIFT};font-size:32px;line-height:40px;color:${FARVER.creme};letter-spacing:1px;">Bakkens Hvile</div>
    </td></tr>
    <tr><td bgcolor="${FARVER.guld}" height="4" style="background:${FARVER.guld};height:4px;line-height:4px;font-size:4px;">&nbsp;</td></tr>

    <!-- Indhold -->
    <tr><td class="bh-pad" bgcolor="#ffffff" style="background:#ffffff;padding:36px 36px 32px;font-family:${SKRIFT};color:${FARVER.blaek};">
${indhold}
    </td></tr>

    <!-- Sidefod -->
    <tr><td align="center" style="padding:22px 24px 8px;font-family:${SKRIFT};font-size:13px;line-height:21px;color:${FARVER.daempet};">
      ${ADRESSE}<br>
      Spørgsmål? Skriv til <a href="mailto:${KONTAKT_EMAIL}" style="color:${FARVER.groen};">${KONTAKT_EMAIL}</a>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

/** En overskrift i indholdsfeltet. Teksten escapes. */
export function overskrift(tekst: string, margin = "0 0 10px"): string {
  return `      <h1 style="margin:${margin};font-family:${SKRIFT};font-size:26px;line-height:32px;font-weight:normal;color:${FARVER.groen};">${escapeHtml(
    tekst
  )}</h1>`;
}

/** En mindre mellemoverskrift. Teksten escapes. */
export function mellemoverskrift(tekst: string, margin = "34px 0 8px"): string {
  return `      <h2 style="margin:${margin};font-family:${SKRIFT};font-size:18px;line-height:24px;font-weight:normal;color:${FARVER.groen};">${escapeHtml(
    tekst
  )}</h2>`;
}

/**
 * Et fremhævet felt med lys baggrund og guldkant i venstre side — bruges til
 * vilkår og korte beskeder. Indholdet er markup og escapes IKKE af denne
 * funktion; kalderen escaper selv det, gæsten har skrevet.
 */
export function fremhaevetFelt(indholdHtml: string, margin = "26px"): string {
  return `      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:${margin};">
        <tr><td bgcolor="${FARVER.cremeLys}" style="background:${FARVER.cremeLys};border-left:3px solid ${FARVER.guld};padding:14px 18px;font-family:${SKRIFT};font-size:13px;line-height:21px;color:#3a3830;">
          ${indholdHtml}
        </td></tr>
      </table>`;
}

/**
 * Én varelinje i bestillingstabellen: tekst, antal og beløb. Beskrivelsen
 * escapes. Beløbet er i øre og vises i hele kroner, præcis som hidtil.
 */
export function varelinje(li: {
  description: string;
  quantity: number;
  amountSubtotalOre: number;
}): string {
  const beloeb =
    li.amountSubtotalOre != null ? (li.amountSubtotalOre / 100).toFixed(0) : "";
  return `        <tr>
          <td style="padding:11px 0;border-bottom:1px solid ${FARVER.streg};font-family:${SKRIFT};font-size:15px;line-height:22px;color:${FARVER.blaek};">${escapeHtml(
    li.description
  )}</td>
          <td align="center" width="50" style="padding:11px 0;border-bottom:1px solid ${FARVER.streg};font-family:${SKRIFT};font-size:15px;color:${FARVER.daempet};">${
    li.quantity
  } stk.</td>
          <td align="right" width="80" style="padding:11px 0;border-bottom:1px solid ${FARVER.streg};font-family:${SKRIFT};font-size:15px;color:${FARVER.blaek};white-space:nowrap;">${beloeb} kr.</td>
        </tr>`;
}

/** Den fede "I alt"-linje nederst i en bestillingstabel. */
export function ialtLinje(mærkat: string, beloeb: string): string {
  return `        <tr>
          <td colspan="2" style="padding:12px 0;border-top:1px solid ${FARVER.streg};font-family:${SKRIFT};font-size:19px;font-weight:bold;color:${FARVER.groen};">${escapeHtml(
    mærkat
  )}</td>
          <td align="right" style="padding:12px 0;border-top:1px solid ${FARVER.streg};font-family:${SKRIFT};font-size:19px;font-weight:bold;color:${FARVER.groen};white-space:nowrap;">${escapeHtml(
    beloeb
  )}</td>
        </tr>`;
}

/** Den lille momsnote under beløbene. Teksten er fast og juridisk. */
export function momsNote(tekst: string): string {
  return `      <p style="margin:2px 0 0;font-family:${SKRIFT};font-size:12px;line-height:18px;color:${FARVER.daempet};">${tekst}</p>`;
}
