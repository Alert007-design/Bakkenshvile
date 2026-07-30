// Billetten, kunden modtager efter bestillingen (bekræftelses-/billetmail).
//
// Bevidst LYS og PRINTVENLIG: ingen mørke baggrunde, lavt blækforbrug, ingen
// afskårne elementer og A4-venlig bredde. Datoen for den konkrete forestilling
// står tydeligt i overskriften og hentes dynamisk. Ingen QR-/stregkode —
// QR-koden bruges alene til at identificere bordene i salen.
//
// Teksten er samlet ét sted, så den let kan redigeres uden at røre webhook-koden.

import type Stripe from "stripe";

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
export function daDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return "";
  return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function daDateLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return "";
  return `${WEEKDAYS_LONG[d.getUTCDay()]} den ${daDateShort(iso)}`;
}
export function showYear(iso: string): number {
  const y = Number(String(iso).slice(0, 4));
  return Number.isFinite(y) ? y : 0;
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
  lineItems: Stripe.LineItem[];
  subtotalKr: number;
  discountKr: number;
  totalKr: number;
  discountLabel: string;
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

  const dateShort = daDateShort(showDateIso);
  const dateLong = daDateLong(showDateIso);
  const heading = dateShort
    ? `Billet til Bakkens Hvile – ${dateShort}`
    : "Billet til Bakkens Hvile";

  const jubileeBanner = isJubilee
    ? `<div style="margin:0 0 20px;padding:12px 16px;border:1px solid #c9a227;border-radius:4px;background:#fbf7ec;color:#0d3b2e;font-size:14px;">
         <strong>Jubilæumsforestilling 2027</strong> — Bakkens Hvile fejrer 150 år.
       </div>`
    : "";

  const detailRow = (label: string, value: string) =>
    value
      ? `<tr>
           <td style="padding:8px 0;border-bottom:1px solid #e5e0d0;color:#6b6858;font-size:13px;">${label}</td>
           <td style="padding:8px 0;border-bottom:1px solid #e5e0d0;text-align:right;font-weight:bold;">${value}</td>
         </tr>`
      : "";

  const detailsTable = `
    <table style="width:100%;border-collapse:collapse;font-size:15px;margin:0 0 24px;">
      ${detailRow("Forestilling", showTitle)}
      ${detailRow("Dato", dateLong || dateShort)}
      ${detailRow("Tidspunkt", showTime ? `kl. ${showTime}` : "")}
      ${detailRow("Pladser", seats)}
      ${detailRow("Ordrenummer", bookingNo)}
    </table>`;

  const rows = lineItems
    .map(
      (li) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e0d0;">${li.description}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e0d0;text-align:center;">${li.quantity}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e0d0;text-align:right;">${
          li.amount_subtotal != null ? (li.amount_subtotal / 100).toFixed(0) : ""
        } kr.</td>
      </tr>`
    )
    .join("");

  // Normalpris, rabat og endelig pris vises altid tydeligt.
  const subtotalRow = `
      <tr>
        <td style="padding:10px 0;" colspan="2">Normalpris</td>
        <td style="padding:10px 0;text-align:right;">${subtotalKr} kr.</td>
      </tr>`;
  const discountRow =
    discountKr > 0
      ? `<tr>
           <td style="padding:2px 0;color:#0d3b2e;" colspan="2">${discountLabel}</td>
           <td style="padding:2px 0;text-align:right;color:#0d3b2e;">−${discountKr} kr.</td>
         </tr>`
      : "";

  const greeting = customerName
    ? `Tak for din billetbestilling, ${customerName}!`
    : "Tak for din billetbestilling!";

  return `
  <div style="font-family:Georgia,'Times New Roman',serif;background:#f6f1e4;padding:32px;color:#1a1a16;">
    <style>
      @media print {
        body, .bh-page { background:#fff !important; }
        .bh-ticket { border:1px solid #999 !important; box-shadow:none !important; page-break-inside:avoid; }
      }
    </style>
    <div class="bh-page" style="max-width:600px;margin:0 auto;">
      <div class="bh-ticket" style="background:#ffffff;border:1px solid #c9a227;border-radius:6px;padding:32px;">
        <p style="letter-spacing:0.15em;text-transform:uppercase;font-size:12px;color:#0d3b2e;margin:0 0 8px;">
          Bakkens Hvile · Underholdning siden 1877
        </p>
        <h1 style="margin:0 0 6px;font-size:24px;color:#0d3b2e;">${heading}</h1>
        <p style="font-family:monospace;color:#8a6d1b;font-size:14px;margin:0 0 20px;">${bookingNo}</p>

        <p style="font-size:15px;margin:0 0 20px;">${greeting}</p>

        ${jubileeBanner}
        ${detailsTable}

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr>
              <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #c9a227;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;color:#6b6858;">Vare</th>
              <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #c9a227;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;color:#6b6858;">Antal</th>
              <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #c9a227;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;color:#6b6858;">Pris</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
          ${subtotalRow}
          ${discountRow}
        </table>
        <p style="text-align:right;margin-top:12px;font-size:18px;color:#0d3b2e;font-weight:bold;">I alt: ${totalKr} kr.</p>

        <div style="margin:24px 0 0;padding:14px 16px;border:1px solid #e5e0d0;border-radius:4px;background:#faf7ef;font-size:13px;line-height:1.6;color:#3a3830;">
          Billetten kan ikke byttes eller refunderes. Bliver du forhindret, kan
          billetten overdrages til tredjemand.
        </div>

        <p style="font-size:13px;color:#6b6858;margin:24px 0 0;line-height:1.6;">
          Vis dette bookingnummer ved indgangen. Vi glæder os til at se dig i
          Bakkens Hvile, Dyrehavsbakken 38, 2930 Klampenborg.
        </p>
      </div>
    </div>
  </div>`;
}
