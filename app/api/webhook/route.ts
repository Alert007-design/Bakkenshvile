import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { updateRecord, TABLES, FIELDS } from "@/lib/airtable";
import { sendMail } from "@/lib/resend";
import Stripe from "stripe";

function ticketEmailHtml(params: {
  bookingNo: string;
  customerName: string;
  lineItems: Stripe.LineItem[];
  total: string;
}) {
  const { bookingNo, customerName, lineItems, total } = params;
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

  return `
  <div style="font-family:Georgia,serif;background:#f6f1e4;padding:32px;color:#1a1a16;">
    <div style="max-width:560px;margin:0 auto;background:#0d3b2e;border-radius:4px;padding:32px;color:#f6f1e4;">
      <p style="letter-spacing:0.15em;text-transform:uppercase;font-size:12px;color:#c9a227;margin:0 0 8px;">
        Bakkens Hvile · Underholdning siden 1877
      </p>
      <h1 style="margin:0 0 16px;font-size:24px;">Tak for din billetbestilling, ${customerName}!</h1>
      <p style="font-family:monospace;color:#c9a227;font-size:14px;margin:0 0 24px;">${bookingNo}</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #c9a227;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;">Vare</th>
            <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #c9a227;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;">Antal</th>
            <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #c9a227;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;">Pris</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <p style="text-align:right;margin-top:16px;font-size:18px;color:#c9a227;">I alt: ${total}</p>

      <p style="font-size:13px;color:#d8d3c2;margin-top:32px;">
        Vis dette bookingnummer ved indgangen. Vi glæder os til at se dig på
        Bakkens Hvile, Dyrehavsbakken 38, 2930 Klampenborg.
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

    if (bookingId) {
      try {
        await updateRecord(TABLES.bookings, bookingId, {
          [FIELDS.booking.status]: "Betalt",
        });
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
        const total = session.amount_total
          ? `${(session.amount_total / 100).toFixed(0)} kr.`
          : "";
        await sendMail({
          to: email,
          subject: `Dine billetter til Bakkens Hvile — ${bookingNo}`,
          html: ticketEmailHtml({
            bookingNo,
            customerName: session.customer_details?.name || "",
            lineItems: lineItems.data,
            total,
          }),
        });
      } catch (err) {
        console.error("Kunne ikke sende billet-mail", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
