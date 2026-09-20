// Fælles e-mail-skabelon for bekræftelser (bruges bl.a. til genbestilling).
// Udbyder-uafhængig: bygger på EmailLineItem (beløb i øre), så mailen kan
// gendannes fra vores egen ledger uden at kalde betalingsudbyderen.
//
// Bruger det fælles mail-layout i lib/mail/layout.ts, så den deler sidehoved og
// sidefod med billet- og gavekortmailene.

import type { EmailLineItem } from "@/lib/ticket-email";
import { ADDON_DISCOUNT_LABEL } from "@/lib/pricing";
import {
  FARVER,
  SKRIFT,
  escapeHtml,
  ialtLinje,
  mailLayout,
  momsNote,
  overskrift,
  varelinje,
} from "@/lib/mail/layout";

export function orderEmailHtml(params: {
  heading: string;
  bookingNo: string;
  lineItems: EmailLineItem[];
  discountKr: number;
  totalLabel: string;
  total: string;
  grandTotal?: string;
  footerNote: string;
}) {
  const {
    heading,
    bookingNo,
    lineItems,
    discountKr,
    totalLabel,
    total,
    grandTotal,
    footerNote,
  } = params;

  const varelinjer = lineItems.map(varelinje).join("\n");

  // Rabatlinjen vises kun, når der faktisk er givet rabat.
  const rabatLinje =
    discountKr > 0
      ? `        <tr>
          <td colspan="2" style="padding:12px 0 10px;font-family:${SKRIFT};font-size:14px;color:${FARVER.groen};">${escapeHtml(
          ADDON_DISCOUNT_LABEL
        )}</td>
          <td align="right" style="padding:12px 0 10px;font-family:${SKRIFT};font-size:14px;color:${FARVER.groen};white-space:nowrap;">&minus;${discountKr} kr.</td>
        </tr>`
      : "";

  // Den samlede bestilling (tidligere betalt + nu betalt) vises kun, når
  // kalderen har oplyst den.
  const samletLinje = grandTotal
    ? `        <tr>
          <td colspan="2" style="padding:10px 0 0;font-family:${SKRIFT};font-size:14px;color:${FARVER.daempet};">Samlet bestilling i alt</td>
          <td align="right" style="padding:10px 0 0;font-family:${SKRIFT};font-size:14px;color:${FARVER.daempet};white-space:nowrap;">${escapeHtml(
        grandTotal
      )}</td>
        </tr>`
    : "";

  const indhold = `${overskrift(heading, "0 0 6px")}
      <p style="margin:0 0 24px;font-family:${SKRIFT};font-size:15px;line-height:22px;color:${FARVER.daempet};">Ordrenummer <strong style="color:${FARVER.groen};letter-spacing:1px;">${escapeHtml(
    bookingNo
  )}</strong></p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${FARVER.guld};">
${varelinjer}
${rabatLinje}
${ialtLinje(totalLabel, total)}
${samletLinje}
      </table>
${momsNote(
  "Alle priser er inklusive 25 % moms. Momsbeløbet svarer til 20 % af den samlede pris inklusive moms."
)}

      <p style="margin:26px 0 0;font-family:${SKRIFT};font-size:15px;line-height:24px;color:${FARVER.blaek};">${escapeHtml(
    footerNote
  )}</p>`;

  return mailLayout({
    title: "Din bestilling til Bakkens Hvile",
    preheader: `Ordrenummer ${bookingNo} – ${totalLabel.toLowerCase()} ${total}`,
    indhold,
  });
}
