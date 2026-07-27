import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { updateRecord, getRecord, TABLES, FIELDS } from "@/lib/airtable";
import { sendMail } from "@/lib/resend";
import { ADDON_DISCOUNT_LABEL } from "@/lib/pricing";
import { addonBreakdown, mergeAddonBreakdowns } from "@/lib/genbestil";
import Stripe from "stripe";

// Fælles e-mail-skabelon for både billetkøb og genbestilling — samme design.
function orderEmailHtml(params: {
  heading: string;
  bookingNo: string;
  lineItems: Stripe.LineItem[];
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
          li.amount_total != null ? (li.amount_total / 100).toFixed(0) : ""
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

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    if (!sig || !secret) throw new Error("Webhook-signatur mangler");
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("Webhook-signatur ugyldig", err);
    return NextResponse.json({ error: "Ugyldig signatur" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.bookingId;
    const bookingNo = session.metadata?.bookingNo || "";
    const isReorder = session.metadata?.reorder === "true";

    const paidKr = Math.round((session.amount_total ?? 0) / 100);
    // Rabatten aflæses direkte på Stripe-sessionen, så mailen viser nøjagtig
    // det beløb, kunden fik trukket via couponen.
    const discountKr = Math.round(
      (session.total_details?.amount_discount ?? 0) / 100
    );

    let grandTotalKr = paidKr;

    if (bookingId) {
      try {
        if (isReorder) {
          // Genbestilling: læg tilvalgene oven i den eksisterende booking og
          // summér rabat + samlet betaling. Der oprettes ingen ny booking.
          const stripe = getStripe();
          const items = await stripe.checkout.sessions.listLineItems(
            session.id,
            { limit: 100 }
          );
          const newAddons = addonBreakdown(
            items.data.map((li) => ({
              name: li.description ?? "",
              quantity: li.quantity ?? 0,
            }))
          );
          const existing = await getRecord(TABLES.bookings, bookingId);
          const prevDiscount = Number(
            existing.fields[FIELDS.booking.discount] ?? 0
          );
          const prevPaid = Number(existing.fields[FIELDS.booking.totalPaid] ?? 0);
          const prevAddons = String(existing.fields[FIELDS.booking.addons] ?? "");
          grandTotalKr = prevPaid + paidKr;
          await updateRecord(TABLES.bookings, bookingId, {
            [FIELDS.booking.addons]: mergeAddonBreakdowns(prevAddons, newAddons),
            [FIELDS.booking.discount]: prevDiscount + discountKr,
            [FIELDS.booking.totalPaid]: grandTotalKr,
          });
        } else {
          // Almindeligt billetkøb: markér betalt og gem det samlede beløb.
          await updateRecord(TABLES.bookings, bookingId, {
            [FIELDS.booking.status]: "Betalt",
            [FIELDS.booking.totalPaid]: paidKr,
          });
        }
      } catch (err) {
        console.error("Kunne ikke opdatere booking i Airtable", err);
      }
    }

    const email = session.customer_details?.email || session.customer_email;
    if (email) {
      try {
        const stripe = getStripe();
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          { limit: 100 }
        );
        const customerName = session.customer_details?.name || "";
        if (isReorder) {
          await sendMail({
            to: email,
            subject: `Din ekstra bestilling til Bakkens Hvile — ${bookingNo}`,
            html: orderEmailHtml({
              heading: `Tak for din ekstra bestilling${
                customerName ? ", " + customerName : ""
              }!`,
              bookingNo,
              lineItems: lineItems.data,
              discountKr,
              totalLabel: "Betalt nu",
              total: `${paidKr} kr.`,
              grandTotal: `${grandTotalKr} kr.`,
              footerNote:
                "Vi har lagt drikkevarerne til din bestilling. Vi glæder os til at se dig på Bakkens Hvile, Dyrehavsbakken 38, 2930 Klampenborg.",
            }),
          });
        } else {
          await sendMail({
            to: email,
            subject: `Dine billetter til Bakkens Hvile — ${bookingNo}`,
            html: orderEmailHtml({
              heading: `Tak for din billetbestilling${
                customerName ? ", " + customerName : ""
              }!`,
              bookingNo,
              lineItems: lineItems.data,
              discountKr,
              totalLabel: "I alt",
              total: `${paidKr} kr.`,
              footerNote:
                "Vis dette bookingnummer ved indgangen. Vi glæder os til at se dig på Bakkens Hvile, Dyrehavsbakken 38, 2930 Klampenborg.",
            }),
          });
        }
      } catch (err) {
        console.error("Kunne ikke sende bekræftelsesmail", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
