// E-mails til gavekort: én til modtageren (med selve koden) og en kvittering
// til køberen. Begge bygger på det fælles mail-layout i lib/mail/layout.ts, så
// de deler sidehoved og sidefod med billetmailen. Ren HTML — ingen afhængighed
// af betalingsudbyderen; alt bygges fra vores egen gavekort-række.

import {
  FARVER,
  SKRIFT,
  escapeHtml,
  fremhaevetFelt,
  mailLayout,
  mellemoverskrift,
  momsNote,
  overskrift,
} from "@/lib/mail/layout";

const REDEEM_EMAIL = "kontor@bakkenshvile.dk";

/** Formaterer en ISO-dato som "14. september 2029" (dansk). */
export function daLongDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const months = [
    "januar", "februar", "marts", "april", "maj", "juni",
    "juli", "august", "september", "oktober", "november", "december",
  ];
  return `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** En række i kvitteringstabellen: mærkat til venstre, værdi til højre. */
function kvitteringsraekke(maerkat: string, vaerdi: string): string {
  return `        <tr>
          <td style="padding:11px 0;border-bottom:1px solid ${FARVER.streg};font-family:${SKRIFT};font-size:13px;font-style:italic;color:${FARVER.daempet};">${escapeHtml(
    maerkat
  )}</td>
          <td align="right" style="padding:11px 0;border-bottom:1px solid ${FARVER.streg};font-family:${SKRIFT};font-size:15px;color:${FARVER.blaek};">${escapeHtml(
    vaerdi
  )}</td>
        </tr>`;
}

export interface GiftCardRecipientEmailParams {
  code: string;
  amountKr: number;
  expiresIso: string;
  purchaserName: string;
  message?: string | null;
}

/** Mail til gavekortets modtager — indeholder koden. */
export function giftCardRecipientEmailHtml(
  params: GiftCardRecipientEmailParams
): string {
  const { code, amountKr, expiresIso, purchaserName, message } = params;

  // Har køberen skrevet en personlig hilsen, vises den i kursiv med afsenderen
  // under. Ellers står der blot, hvem gavekortet er fra.
  const hilsen = message
    ? `      <p style="margin:0 0 26px;font-family:${SKRIFT};font-size:16px;line-height:25px;font-style:italic;color:${FARVER.blaek};">&ldquo;${escapeHtml(
        message
      )}&rdquo;<br><span style="font-style:normal;color:${FARVER.daempet};">&mdash; ${escapeHtml(
        purchaserName
      )}</span></p>`
    : `      <p style="margin:0 0 26px;font-family:${SKRIFT};font-size:16px;line-height:25px;color:${FARVER.blaek};">En hilsen fra ${escapeHtml(
        purchaserName
      )}.</p>`;

  const gyldigTil = daLongDate(expiresIso);
  const gyldigLinje = gyldigTil
    ? `            <tr><td align="center" style="padding:6px 20px 28px;font-family:${SKRIFT};font-size:14px;line-height:21px;color:#d8d3c2;">
              Gyldigt til og med <strong style="color:${FARVER.creme};">${escapeHtml(
        gyldigTil
      )}</strong>
            </td></tr>`
    : "";

  const indhold = `${overskrift("Du har fået et gavekort")}
${hilsen}

      <!-- Selve gavekortet -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td bgcolor="${FARVER.groen}" style="background:${FARVER.groen};padding:7px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${FARVER.guld};">
            <tr><td align="center" style="padding:30px 20px 8px;">
              <div style="font-family:${SKRIFT};font-size:17px;font-style:italic;line-height:24px;color:${FARVER.guld};">Gavekort til Bakkens Hvile</div>
              <div class="bh-big" style="font-family:${SKRIFT};font-size:54px;line-height:66px;color:${FARVER.creme};">${amountKr} kr.</div>
            </td></tr>
            <tr><td align="center" style="padding:10px 24px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr><td align="center" bgcolor="${FARVER.creme}" style="background:${FARVER.creme};padding:14px 26px;">
                  <div style="font-family:${SKRIFT};font-size:13px;font-style:italic;line-height:18px;color:${FARVER.daempet};">Din kode</div>
                  <div style="font-family:'Courier New',Courier,monospace;font-size:24px;line-height:32px;font-weight:bold;letter-spacing:3px;color:${FARVER.groen};white-space:nowrap;">${escapeHtml(
    code
  )}</div>
                </td></tr>
              </table>
            </td></tr>
${gyldigLinje}
          </table>
        </td></tr>
      </table>

${mellemoverskrift("Sådan bruger du det", "32px 0 8px")}
      <p style="margin:0;font-family:${SKRIFT};font-size:15px;line-height:24px;color:${FARVER.blaek};">Skriv til <a href="mailto:${REDEEM_EMAIL}" style="color:${FARVER.groen};">${REDEEM_EMAIL}</a> med koden, eller vis koden i døren, når du kommer. Vi glæder os til at se dig i Bakkens Hvile.</p>`;

  return mailLayout({
    title: "Du har fået et gavekort til Bakkens Hvile",
    preheader: `Et gavekort på ${amountKr} kr. fra ${purchaserName}.`,
    indhold,
  });
}

export interface GiftCardPurchaserEmailParams {
  giftCardNo: string;
  amountKr: number;
  recipientEmail: string;
  expiresIso: string;
}

/** Kvittering til køberen (uden selve koden — den er sendt til modtageren). */
export function giftCardPurchaserEmailHtml(
  params: GiftCardPurchaserEmailParams
): string {
  const { giftCardNo, amountKr, recipientEmail, expiresIso } = params;
  const gyldigTil = daLongDate(expiresIso);

  const indhold = `${overskrift("Kvittering for dit gavekort", "0 0 6px")}
      <p style="margin:0 0 24px;font-family:${SKRIFT};font-size:15px;line-height:22px;color:${FARVER.daempet};">Ordrenummer <strong style="color:${FARVER.groen};letter-spacing:1px;">${escapeHtml(
    giftCardNo
  )}</strong></p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${FARVER.guld};">
${kvitteringsraekke("Gavekort", `${amountKr} kr.`)}
${kvitteringsraekke("Sendt til", recipientEmail)}
${gyldigTil ? kvitteringsraekke("Gyldigt til og med", gyldigTil) : ""}
        <tr>
          <td style="padding:13px 0;font-family:${SKRIFT};font-size:19px;font-weight:bold;color:${FARVER.groen};">I alt</td>
          <td align="right" style="padding:13px 0;font-family:${SKRIFT};font-size:19px;font-weight:bold;color:${FARVER.groen};">${amountKr} kr.</td>
        </tr>
      </table>
${momsNote("Alle priser er inklusive 25 % moms.")}

${fremhaevetFelt(
  `Gavekortet og koden er sendt til modtageren på e-mail. Har du spørgsmål, så skriv til <a href="mailto:${REDEEM_EMAIL}" style="color:${FARVER.groen};">${REDEEM_EMAIL}</a>.`
)}`;

  return mailLayout({
    title: "Kvittering for dit gavekort",
    preheader: `Kvittering ${giftCardNo} – gavekort på ${amountKr} kr.`,
    indhold,
  });
}
