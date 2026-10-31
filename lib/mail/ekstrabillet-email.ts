// Mailen til en gæst, som personalet har lagt ekstra billetter ind til.
// Gæsten betaler selv via linket fra Viva. Billetten kommer først, når
// betalingen er gennemført (den almindelige billetmail fra webhooken).

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
import { daDateLong, pladserTekst } from "@/lib/ticket-email";

export interface EkstrabilletMailParams {
  kundeNavn: string;
  bookingNo: string;
  showTitle: string;
  showDateIso: string;
  showTime: string;
  /** Som gemt i bookingen, fx "A (7.-8.-9. række) x2". */
  pladser: string;
  linjer: { description: string; quantity: number; amountSubtotalOre: number }[];
  totalOre: number;
  betalingslink: string;
  /** Hvornår linket udløber, som tekst (fx "søndag den 1. november kl. 12.05"). */
  udloeber: string;
}

function kr(ore: number): string {
  return `${Math.round(ore / 100).toLocaleString("da-DK")} kr.`;
}

export function ekstrabilletEmailHtml(p: EkstrabilletMailParams): string {
  const hilsen = p.kundeNavn
    ? `Kære ${escapeHtml(p.kundeNavn)}.`
    : "Hej.";
  const dato = daDateLong(p.showDateIso);
  const forestilling = [
    p.showTitle,
    dato ? `${dato}${p.showTime ? ` kl. ${p.showTime}` : ""}` : "",
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br>");

  const knap = `      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 8px;">
        <tr><td align="center" bgcolor="${FARVER.groen}" style="background:${FARVER.groen};border-radius:4px;">
          <a href="${escapeHtml(p.betalingslink)}" style="display:inline-block;padding:14px 30px;font-family:${SKRIFT};font-size:17px;line-height:22px;color:${FARVER.creme};text-decoration:none;font-weight:bold;">Betal dine billetter</a>
        </td></tr>
      </table>`;

  const indhold = `${overskrift("Dine billetter er klar til betaling")}
      <p style="margin:0 0 14px;font-family:${SKRIFT};font-size:16px;line-height:25px;color:${FARVER.blaek};">${hilsen}</p>
      <p style="margin:0 0 14px;font-family:${SKRIFT};font-size:16px;line-height:25px;color:${FARVER.blaek};">Vi har lagt billetter til side til dig. Når du har betalt, får du selve billetten på mail.</p>
      <p style="margin:0 0 6px;font-family:${SKRIFT};font-size:16px;line-height:25px;color:${FARVER.groen};"><strong>${forestilling}</strong></p>
      <p style="margin:0;font-family:${SKRIFT};font-size:15px;line-height:23px;color:${FARVER.blaek};">Pladser: ${escapeHtml(
        pladserTekst(p.pladser)
      )}</p>
      <p style="margin:6px 0 0;font-family:${SKRIFT};font-size:14px;line-height:20px;color:${FARVER.daempet};">Bookingnummer: ${escapeHtml(
        p.bookingNo
      )}</p>
${knap}
      <p style="margin:0;text-align:center;font-family:${SKRIFT};font-size:13px;line-height:19px;color:${FARVER.daempet};">Linket gælder til ${escapeHtml(
        p.udloeber
      )}. Betaler du ikke inden da, frigives pladserne.</p>

${mellemoverskrift("Din bestilling")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${FARVER.guld};">
${p.linjer.map(varelinje).join("\n")}
${ialtLinje("At betale", kr(p.totalOre))}
      </table>
${momsNote(
  "Alle priser er inklusive 25 % moms. Momsbeløbet svarer til 20 % af den samlede pris inklusive moms."
)}

${fremhaevetFelt(
  `Virker knappen ikke, kan du kopiere dette link ind i din browser:<br><span style="word-break:break-all;">${escapeHtml(
    p.betalingslink
  )}</span>`
)}`;

  return mailLayout({
    title: "Betal dine billetter til Bakkens Hvile",
    preheader: `${p.bookingNo} – ${kr(p.totalOre)} – linket gælder til ${p.udloeber}`,
    indhold,
  });
}
