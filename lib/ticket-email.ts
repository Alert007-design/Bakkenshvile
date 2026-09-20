// Billetten, kunden modtager efter bestillingen (bekræftelses-/billetmail).
//
// Bygget på det fælles mail-layout i lib/mail/layout.ts, så udseendet kun
// vedligeholdes ét sted. Tabelbaseret og Outlook-sikkert: ingen div-layout,
// ingen webfonte, ingen billeder. Ingen QR-/stregkode — QR-koden bruges alene
// til at identificere bordene i salen.
//
// Teksten er samlet her, så den let kan redigeres uden at røre webhook-koden.

import {
  FARVER,
  SKRIFT,
  escapeHtml,
  fremhaevetFelt,
  ialtLinje,
  mailLayout,
  mellemoverskrift,
  momsNote,
  overskrift,
  varelinje,
} from "@/lib/mail/layout";

// Udbyder-uafhængig linje til mails. Beløbet er i øre, så mailen kan bygges
// uden at kalde betalingsudbyderen igen (fx fra vores egen ledger).
export interface EmailLineItem {
  description: string;
  quantity: number;
  amountSubtotalOre: number;
}

const WEEKDAYS_LONG = [
  "søndag",
  "mandag",
  "tirsdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lørdag",
];
const MONTHS = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];

// Datoen er en ren kalenderdato (YYYY-MM-DD) uden klokkeslæt; UTC-felterne
// bruges bevidst, så visningen ikke forskydes af serverens tidszone.
function utcDate(iso: string): Date | null {
  const d = new Date(`${iso}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

export function daDateShort(iso: string): string {
  const d = utcDate(iso);
  if (!d) return "";
  return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function daDateLong(iso: string): string {
  const d = utcDate(iso);
  if (!d) return "";
  return `${WEEKDAYS_LONG[d.getUTCDay()]} den ${daDateShort(iso)}`;
}
export function showYear(iso: string): number {
  const y = Number(String(iso).slice(0, 4));
  return Number.isFinite(y) ? y : 0;
}

/** Datoen delt op til billettens datofelt: ugedag, dag, måned + år. */
function datoDele(iso: string): { ugedag: string; dag: string; maaned: string } | null {
  const d = utcDate(iso);
  if (!d) return null;
  return {
    ugedag: WEEKDAYS_LONG[d.getUTCDay()],
    dag: `${d.getUTCDate()}.`,
    maaned: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
  };
}

export interface TicketEmailParams {
  customerName: string;
  bookingNo: string;
  showTitle: string;
  showDateIso: string;
  showTime: string;
  /** Billetkategori + antal, fx "A+ x2, B x1". */
  seats: string;
  /** Sand for forestillinger i 2027 (150-års-jubilæet). */
  isJubilee: boolean;
  lineItems: EmailLineItem[];
  subtotalKr: number;
  discountKr: number;
  totalKr: number;
  discountLabel: string;
}

/** Den mørkegrønne datoblok i venstre side af billetten. */
function datoFelt(showDateIso: string, showTime: string): string {
  const dele = datoDele(showDateIso);
  if (!dele) return "";
  const tid = showTime
    ? `<div style="font-family:${SKRIFT};font-size:16px;line-height:26px;color:${FARVER.guld};">kl. ${escapeHtml(
        showTime
      )}</div>`
    : "";
  return `          <td width="132" align="center" valign="middle" bgcolor="${FARVER.groen}" style="width:132px;background:${FARVER.groen};padding:20px 8px;">
            <div style="font-family:${SKRIFT};font-size:14px;font-style:italic;color:${FARVER.guld};line-height:20px;">${dele.ugedag}</div>
            <div class="bh-big" style="font-family:${SKRIFT};font-size:56px;line-height:60px;color:${FARVER.creme};">${dele.dag}</div>
            <div style="font-family:${SKRIFT};font-size:16px;line-height:22px;color:${FARVER.creme};">${dele.maaned}</div>
            ${tid}
          </td>`;
}

/** En mærkat + værdi i billettens højre side ("Forestilling", "Pladser"). */
function billetFelt(maerkat: string, vaerdi: string, bundmargen = 0): string {
  if (!vaerdi) return "";
  return `            <div style="font-family:${SKRIFT};font-size:13px;font-style:italic;color:${FARVER.daempet};line-height:18px;">${escapeHtml(
    maerkat
  )}</div>
            <div style="font-family:${SKRIFT};font-size:17px;line-height:24px;color:${FARVER.blaek};padding-bottom:${bundmargen}px;">${escapeHtml(
    vaerdi
  )}</div>`;
}

export function ticketEmailHtml(params: TicketEmailParams): string {
  const {
    customerName,
    bookingNo,
    showTitle,
    showDateIso,
    showTime,
    seats,
    isJubilee,
    lineItems,
    subtotalKr,
    discountKr,
    totalKr,
    discountLabel,
  } = params;

  const harDato = Boolean(datoDele(showDateIso));
  const hilsen = customerName
    ? `Tak for din bestilling, ${escapeHtml(customerName)}. Vi glæder os til at se dig.`
    : "Tak for din bestilling. Vi glæder os til at se dig.";

  // Forestillingens titel står med fed, derfor sin egen blok frem for billetFelt.
  const titelFelt = showTitle
    ? `            <div style="font-family:${SKRIFT};font-size:13px;font-style:italic;color:${FARVER.daempet};line-height:18px;">Forestilling</div>
            <div style="font-family:${SKRIFT};font-size:21px;line-height:27px;font-weight:bold;color:${FARVER.groen};padding-bottom:12px;">${escapeHtml(
        showTitle
      )}</div>`
    : "";

  const jubilaeumsbaand = isJubilee
    ? `      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
        <tr><td align="center" bgcolor="${FARVER.cremeLys}" style="background:${FARVER.cremeLys};border:1px solid ${FARVER.guld};padding:11px 16px;font-family:${SKRIFT};font-size:14px;line-height:21px;color:${FARVER.groen};">
          <strong>Jubilæumsforestilling 2027</strong> &ndash; Bakkens Hvile fejrer 150 år
        </td></tr>
      </table>`
    : "";

  const varelinjer = lineItems.map(varelinje).join("\n");

  // Normalpris og rabatlinjen hører sammen og vises KUN, når der faktisk er
  // givet rabat. Uden rabat er normalprisen jo den samme som totalen.
  const rabatLinjer =
    discountKr > 0
      ? `        <tr>
          <td colspan="2" style="padding:12px 0 2px;font-family:${SKRIFT};font-size:14px;color:${FARVER.daempet};">Normalpris</td>
          <td align="right" style="padding:12px 0 2px;font-family:${SKRIFT};font-size:14px;color:${FARVER.daempet};white-space:nowrap;">${subtotalKr} kr.</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:2px 0 10px;font-family:${SKRIFT};font-size:14px;color:${FARVER.groen};">${escapeHtml(
          discountLabel
        )}</td>
          <td align="right" style="padding:2px 0 10px;font-family:${SKRIFT};font-size:14px;color:${FARVER.groen};white-space:nowrap;">&minus;${discountKr} kr.</td>
        </tr>`
      : "";

  const indhold = `${overskrift("Her er din billet")}
      <p style="margin:0 0 26px;font-family:${SKRIFT};font-size:16px;line-height:25px;color:${FARVER.blaek};">${hilsen}</p>

      <!-- Selve billetten -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${FARVER.guld};">
        <tr>
${datoFelt(showDateIso, showTime)}
          <td valign="middle" bgcolor="${FARVER.cremeLys}" style="background:${FARVER.cremeLys};padding:20px 22px;">
${titelFelt}
${billetFelt("Pladser", seats)}
          </td>
        </tr>
        <tr>
          <td colspan="${harDato ? 2 : 1}" bgcolor="#ffffff" style="background:#ffffff;border-top:2px dashed ${FARVER.guld};padding:16px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td valign="middle">
                <div style="font-family:${SKRIFT};font-size:13px;font-style:italic;color:${FARVER.daempet};line-height:18px;">Bookingnummer</div>
                <div style="font-family:${SKRIFT};font-size:24px;line-height:30px;font-weight:bold;letter-spacing:1px;color:${FARVER.groen};">${escapeHtml(
    bookingNo
  )}</div>
              </td>
              <td align="right" valign="middle" style="font-family:${SKRIFT};font-size:14px;font-style:italic;line-height:20px;color:${FARVER.daempet};">Vis nummeret<br>ved indgangen</td>
            </tr></table>
          </td>
        </tr>
      </table>
${jubilaeumsbaand}

${mellemoverskrift("Din bestilling")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${FARVER.guld};">
${varelinjer}
${rabatLinjer}
${ialtLinje("I alt", `${totalKr} kr.`)}
      </table>
${momsNote(
  "Alle priser er inklusive 25 % moms. Momsbeløbet svarer til 20 % af den samlede pris inklusive moms."
)}

${fremhaevetFelt(
  "Bliver du selv forhindret, kan billetten ikke byttes eller refunderes, men den kan i stedet overdrages til tredjemand. Hvis en forestilling aflyses, tilbagebetales billetprisen og prisen for ikke-leverede tilvalg."
)}`;

  return mailLayout({
    title: "Din billet til Bakkens Hvile",
    preheader: `Bookingnummer ${bookingNo} – vis det ved indgangen.`,
    indhold,
  });
}
