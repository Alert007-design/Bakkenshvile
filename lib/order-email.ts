// Fælles e-mail-skabelon for bekræftelser (bruges bl.a. til genbestilling).
// Udbyder-uafhængig: bygger på EmailLineItem (beløb i øre), så mailen kan
// gendannes fra vores egen ledger uden at kalde betalingsudbyderen.

import type { EmailLineItem } from "@/lib/ticket-email";
import { ADDON_DISCOUNT_LABEL } from "@/lib/pricing";

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
  const discountRow =
    discountKr > 0
      ? `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e0d0;">${ADDON_DISCOUNT_LABEL}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e0d0;text-align:center;"></td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e0d0;text-align:right;color:#c9a227;">−${discountKr} kr.</td>
      </tr>`
      : "";
  const rows = lineItems
    .map(
      (li) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e0d0;">${li.description}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e0d0;text-align:center;">${li.quantity}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e0d0;text-align:right;">${
          li.amountSubtotalOre != null ? (li.amountSubtotalOre / 100).toFixed(0) : ""
        } kr.</td>
      </tr>`
    )
    .join("");
  const grandTotalRow = grandTotal
    ? `<p style="text-align:right;margin:4px 0 0;font-size:14px;color:#d8d3c2;">Samlet bestilling i alt: ${grandTotal}</p>`
    : "";

  return `
  <div style="font-family:Georgia,serif;background:#f6f1e4;padding:32px;color:#1a1a16;">
    <div style="max-width:560px;margin:0 auto;background:#0d3b2e;border-radius:4px;padding:32px;color:#f6f1e4;">
      <p style="letter-spacing:0.15em;text-transform:uppercase;font-size:12px;color:#c9a227;margin:0 0 8px;">
        Bakkens Hvile · Underholdning siden 1877
      </p>
      <h1 style="margin:0 0 16px;font-size:24px;">${heading}</h1>
      <p style="font-family:monospace;color:#c9a227;font-size:14px;margin:0 0 24px;">${bookingNo}</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #c9a227;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;">Vare</th>
            <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #c9a227;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;">Antal</th>
            <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #c9a227;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;">Pris</th>
          </tr>
        </thead>
        <tbody>${rows}${discountRow}</tbody>
      </table>

      <p style="text-align:right;margin-top:16px;font-size:18px;color:#c9a227;">${totalLabel}: ${total}</p>
      ${grandTotalRow}

      <p style="font-size:13px;color:#d8d3c2;margin-top:32px;">
        ${footerNote}
      </p>
    </div>
  </div>`;
}
