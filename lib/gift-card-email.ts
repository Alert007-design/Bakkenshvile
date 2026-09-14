// E-mails til gavekort: én til modtageren (med selve koden) og en kvittering
// til køberen. Samme grøn/guld-brand som lib/order-email.ts. Ren HTML — ingen
// afhængighed af betalingsudbyderen; alt bygges fra vores egen gavekort-række.

const REDEEM_EMAIL = "kontor@bakkenshvile.dk";

/** Formaterer en ISO-dato som "14. september 2029" (dansk). */
export function daLongDate(iso: string): string {
  const d = new Date(iso);
  const months = [
    "januar", "februar", "marts", "april", "maj", "juni",
    "juli", "august", "september", "oktober", "november", "december",
  ];
  return `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function shell(inner: string): string {
  return `
  <div style="font-family:Georgia,serif;background:#f6f1e4;padding:32px;color:#1a1a16;">
    <div style="max-width:560px;margin:0 auto;background:#0d3b2e;border-radius:4px;padding:32px;color:#f6f1e4;">
      <p style="letter-spacing:0.15em;text-transform:uppercase;font-size:12px;color:#c9a227;margin:0 0 8px;">
        Bakkens Hvile · Underholdning siden 1877
      </p>
      ${inner}
    </div>
  </div>`;
}

export interface GiftCardRecipientEmailParams {
  code: string;
  amountKr: number;
  expiresIso: string;
  purchaserName: string;
  message?: string | null;
}

/** Mail til gavekortets modtager — indeholder koden. */
export function giftCardRecipientEmailHtml(params: GiftCardRecipientEmailParams): string {
  const { code, amountKr, expiresIso, purchaserName, message } = params;
  const greeting = message
    ? `<p style="font-size:14px;color:#f6f1e4;margin:0 0 20px;font-style:italic;">&ldquo;${message}&rdquo;<br><span style="font-style:normal;color:#d8d3c2;">— ${purchaserName}</span></p>`
    : `<p style="font-size:14px;color:#d8d3c2;margin:0 0 20px;">En hilsen fra ${purchaserName}.</p>`;
  return shell(`
      <h1 style="margin:0 0 16px;font-size:24px;">Du har fået et gavekort til Bakkens Hvile</h1>
      ${greeting}
      <div style="background:#f6f1e4;color:#0d3b2e;border-radius:4px;padding:20px;text-align:center;margin:0 0 20px;">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#5a6b60;">Gavekort · værdi</p>
        <p style="margin:0 0 12px;font-size:28px;font-weight:bold;color:#0d3b2e;">${amountKr} kr.</p>
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#5a6b60;">Kode</p>
        <p style="margin:0;font-family:monospace;font-size:22px;letter-spacing:0.12em;color:#0d3b2e;">${code}</p>
      </div>
      <p style="font-size:14px;color:#d8d3c2;margin:0 0 8px;">
        Gavekortet er gyldigt til og med <strong style="color:#f6f1e4;">${daLongDate(expiresIso)}</strong>.
      </p>
      <p style="font-size:14px;color:#d8d3c2;margin:0 0 24px;">
        Sådan bruger du det: skriv til <a href="mailto:${REDEEM_EMAIL}" style="color:#c9a227;">${REDEEM_EMAIL}</a> med koden,
        eller vis koden i døren, når du kommer. Vi glæder os til at se dig i Bakkens Hvile,
        Dyrehavsbakken 38, 2930 Klampenborg.
      </p>`);
}

export interface GiftCardPurchaserEmailParams {
  giftCardNo: string;
  amountKr: number;
  recipientEmail: string;
  expiresIso: string;
}

/** Kvittering til køberen (uden selve koden — den er sendt til modtageren). */
export function giftCardPurchaserEmailHtml(params: GiftCardPurchaserEmailParams): string {
  const { giftCardNo, amountKr, recipientEmail, expiresIso } = params;
  return shell(`
      <h1 style="margin:0 0 16px;font-size:24px;">Kvittering for dit gavekort</h1>
      <p style="font-family:monospace;color:#c9a227;font-size:14px;margin:0 0 24px;">${giftCardNo}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#f6f1e4;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #1c5443;">Gavekort</td>
          <td style="padding:10px 0;border-bottom:1px solid #1c5443;text-align:right;">${amountKr} kr.</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #1c5443;">Sendt til</td>
          <td style="padding:10px 0;border-bottom:1px solid #1c5443;text-align:right;">${recipientEmail}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #1c5443;">Gyldigt til og med</td>
          <td style="padding:10px 0;border-bottom:1px solid #1c5443;text-align:right;">${daLongDate(expiresIso)}</td>
        </tr>
      </table>
      <p style="text-align:right;margin:4px 0 0;font-size:12px;color:#9c968a;">Alle priser er inklusive 25 % moms.</p>
      <p style="font-size:13px;color:#d8d3c2;margin-top:32px;">
        Gavekortet og koden er sendt til modtageren på e-mail. Har du spørgsmål, så skriv til
        <a href="mailto:${REDEEM_EMAIL}" style="color:#c9a227;">${REDEEM_EMAIL}</a>.
      </p>`);
}
