// Mails til store selskaber med betalingsfrist: invitation til at betale,
// påmindelse tre dage før fristen og besked om annullering. Desuden en kort
// intern besked til kontoret, når en reservation annulleres.

import {
  FARVER,
  KONTAKT_EMAIL,
  SKRIFT,
  escapeHtml,
  fremhaevetFelt,
  ialtLinje,
  mailLayout,
  mellemoverskrift,
  overskrift,
  varelinje,
} from "@/lib/mail/layout";
import { daDateLong, pladserTekst } from "@/lib/ticket-email";

export interface SelskabMailParams {
  kundeNavn: string;
  bookingNo: string;
  showTitle: string;
  showDateIso: string;
  showTime: string;
  /** Som gemt i bookingen, fx "A (7.-8.-9. række) x12". */
  pladser: string;
  /** Billetlinjerne (pris + gebyr), uden drikkevarer. */
  linjer: { description: string; quantity: number; amountSubtotalOre: number }[];
  /** Billetternes samlede pris i øre. */
  billetterOre: number;
  /** Fristen som ÅÅÅÅ-MM-DD. */
  fristIso: string;
  /** Linket til selskabets betalingsside. */
  betalingsside: string;
}

function kr(ore: number): string {
  return `${Math.round(ore / 100).toLocaleString("da-DK")} kr.`;
}

const tekstStil = `margin:0 0 14px;font-family:${SKRIFT};font-size:16px;line-height:25px;color:${FARVER.blaek};`;

function hilsen(navn: string): string {
  return navn ? `Kære ${escapeHtml(navn)}.` : "Hej.";
}

function forestillingHtml(p: SelskabMailParams): string {
  const dato = daDateLong(p.showDateIso);
  return [p.showTitle, dato ? `${dato}${p.showTime ? ` kl. ${p.showTime}` : ""}` : ""]
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br>");
}

function knap(link: string, tekst: string): string {
  return `      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 8px;">
        <tr><td align="center" bgcolor="${FARVER.groen}" style="background:${FARVER.groen};border-radius:4px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 30px;font-family:${SKRIFT};font-size:17px;line-height:22px;color:${FARVER.creme};text-decoration:none;font-weight:bold;">${escapeHtml(tekst)}</a>
        </td></tr>
      </table>`;
}

function bestillingHtml(p: SelskabMailParams): string {
  return `<p style="margin:0 0 6px;font-family:${SKRIFT};font-size:16px;line-height:25px;color:${FARVER.groen};"><strong>${forestillingHtml(p)}</strong></p>
      <p style="margin:0;font-family:${SKRIFT};font-size:15px;line-height:23px;color:${FARVER.blaek};">Pladser: ${escapeHtml(
        pladserTekst(p.pladser)
      )}</p>
      <p style="margin:6px 0 0;font-family:${SKRIFT};font-size:14px;line-height:20px;color:${FARVER.daempet};">Bookingnummer: ${escapeHtml(
        p.bookingNo
      )}</p>`;
}

function billetterHtml(p: SelskabMailParams): string {
  return `${mellemoverskrift("Billetterne")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${FARVER.guld};">
${p.linjer.map(varelinje).join("\n")}
${ialtLinje("Billetter i alt", kr(p.billetterOre))}
      </table>
      <p style="margin:10px 0 0;font-family:${SKRIFT};font-size:14px;line-height:21px;color:${FARVER.daempet};">Alle priser er inklusive moms. På betalingssiden kan I også bestille drikkevarer til bordet med 10 % rabat.</p>`;
}

function linkFelt(link: string): string {
  return fremhaevetFelt(
    `Virker knappen ikke, kan du kopiere dette link ind i din browser:<br><span style="word-break:break-all;">${escapeHtml(
      link
    )}</span>`
  );
}

/** Mailen, kunden får, når reservationen er oprettet. */
export function selskabInvitationHtml(p: SelskabMailParams): string {
  const frist = daDateLong(p.fristIso);
  const indhold = `${overskrift("Jeres pladser er reserveret")}
      <p style="${tekstStil}">${hilsen(p.kundeNavn)}</p>
      <p style="${tekstStil}">Vi har reserveret pladser til jeres selskab. Pladserne er jeres, når billetterne er betalt senest ${escapeHtml(
        frist
      )}. Derefter får I selve billetten på mail.</p>
      ${bestillingHtml(p)}
${knap(p.betalingsside, "Se bestillingen og betal")}
      <p style="margin:0;text-align:center;font-family:${SKRIFT};font-size:13px;line-height:19px;color:${FARVER.daempet};">Sidste frist for betaling: ${escapeHtml(
        frist
      )}. Er reservationen ikke betalt inden da, annulleres den.</p>
${billetterHtml(p)}
${linkFelt(p.betalingsside)}`;
  return mailLayout({
    title: "Jeres pladser i Bakkens Hvile er reserveret",
    preheader: `${p.bookingNo} – betal senest ${frist}`,
    indhold,
  });
}

/** Påmindelsen tre dage før fristen. */
export function selskabPaamindelseHtml(p: SelskabMailParams): string {
  const frist = daDateLong(p.fristIso);
  const indhold = `${overskrift("Husk betalingen")}
      <p style="${tekstStil}">${hilsen(p.kundeNavn)}</p>
      <p style="${tekstStil}">Fristen for at betale jeres reserverede billetter er ${escapeHtml(
        frist
      )}. Vi har endnu ikke modtaget betalingen. Er den ikke kommet inden da, annulleres reservationen, og pladserne sættes til salg igen.</p>
      ${bestillingHtml(p)}
${knap(p.betalingsside, "Betal nu")}
${billetterHtml(p)}
${linkFelt(p.betalingsside)}
      <p style="margin:20px 0 0;font-family:${SKRIFT};font-size:14px;line-height:21px;color:${FARVER.daempet};">Har I allerede betalt via faktura, kan I se bort fra denne mail. Spørgsmål kan sendes til ${escapeHtml(
        KONTAKT_EMAIL
      )}.</p>`;
  return mailLayout({
    title: "Husk at betale jeres billetter til Bakkens Hvile",
    preheader: `${p.bookingNo} – fristen er ${frist}`,
    indhold,
  });
}

/** Besked til kunden, når en ubetalt reservation er annulleret. */
export function selskabAnnulleretHtml(p: SelskabMailParams): string {
  const frist = daDateLong(p.fristIso);
  const indhold = `${overskrift("Reservationen er annulleret")}
      <p style="${tekstStil}">${hilsen(p.kundeNavn)}</p>
      <p style="${tekstStil}">Fristen for at betale jeres reserverede billetter var ${escapeHtml(
        frist
      )}. Vi har ikke modtaget betalingen, så reservationen er annulleret, og pladserne er sat til salg igen.</p>
      ${bestillingHtml(p)}
      <p style="margin:20px 0 0;font-family:${SKRIFT};font-size:15px;line-height:23px;color:${FARVER.blaek};">Er der sket en fejl, eller vil I stadig gerne komme, så skriv til ${escapeHtml(
        KONTAKT_EMAIL
      )}. Er der stadig ledige pladser, finder vi en løsning.</p>`;
  return mailLayout({
    title: "Jeres reservation i Bakkens Hvile er annulleret",
    preheader: `${p.bookingNo} – reservationen er annulleret`,
    indhold,
  });
}

/** Intern besked til kontoret om en annulleret reservation. */
export function selskabAnnulleretInternHtml(p: SelskabMailParams & { kundeEmail: string }): string {
  const indhold = `${overskrift("Reservation annulleret")}
      <p style="${tekstStil}">Reservationen ${escapeHtml(p.bookingNo)} til ${escapeHtml(
        p.kundeNavn || p.kundeEmail
      )} (${escapeHtml(p.kundeEmail)}) er ikke betalt inden fristen ${escapeHtml(
        daDateLong(p.fristIso)
      )} og er annulleret. Pladserne er sat til salg igen, og kunden har fået besked.</p>
      ${bestillingHtml(p)}`;
  return mailLayout({
    title: "Reservation annulleret",
    preheader: `${p.bookingNo} er annulleret`,
    indhold,
  });
}
