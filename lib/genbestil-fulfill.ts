// Fuldfører en betalt genbestilling: lægger drikkevarerne oven i den
// eksisterende booking i Airtable og sender bekræftelsen til gæsten.
//
// Rækkefølgen er vigtig. Fejler Airtable-opdateringen, kastes fejlen, så
// webhooken kan rulle betalingen tilbage, og Viva prøver igen (intet er skrevet).
// Er Airtable derimod opdateret, må en fejlet mail ALDRIG få betalingen til at
// starte forfra, for så lægges drinks og beløb på bookingen en gang til. I stedet
// får kontoret besked.

import { getRecord, updateRecord, TABLES, FIELDS } from "@/lib/airtable";
import { addonBreakdown, mergeAddonBreakdowns } from "@/lib/genbestil";
import { orderEmailHtml } from "@/lib/order-email";
import { sendMail } from "@/lib/resend";
import { advarOmManglendeBekraeftelse } from "@/lib/payment-alerts";
import type { TicketPaymentRow } from "@/lib/ticket-payments";

export async function fulfillGenbestilling(payment: TicketPaymentRow): Promise<void> {
  const paidKr = Math.round(payment.expectedTotalOre / 100);
  const discountKr = Math.round(payment.discountOre / 100);

  const existing = await getRecord(TABLES.bookings, payment.bookingId);
  const prevDiscount = Number(existing.fields[FIELDS.booking.discount] ?? 0);
  const prevPaid = Number(existing.fields[FIELDS.booking.totalPaid] ?? 0);
  const prevAddons = String(existing.fields[FIELDS.booking.addons] ?? "");
  const newAddons = addonBreakdown(
    payment.lineItems.map((li) => ({ name: li.description, quantity: li.quantity }))
  );
  const grandTotalKr = prevPaid + paidKr;
  await updateRecord(TABLES.bookings, payment.bookingId, {
    [FIELDS.booking.addons]: mergeAddonBreakdowns(prevAddons, newAddons),
    [FIELDS.booking.discount]: prevDiscount + discountKr,
    [FIELDS.booking.totalPaid]: grandTotalKr,
  });

  // Herfra er bookingen opdateret. Intet må kaste længere.
  if (!payment.customerEmail) return;
  try {
    await sendMail({
      to: payment.customerEmail,
      subject: `Din ekstra bestilling til Bakkens Hvile — ${payment.bookingNo}`,
      html: orderEmailHtml({
        heading: `Tak for din ekstra bestilling${
          payment.customerName ? ", " + payment.customerName : ""
        }!`,
        bookingNo: payment.bookingNo,
        lineItems: payment.lineItems,
        discountKr,
        totalLabel: "Betalt nu",
        total: `${paidKr} kr.`,
        grandTotal: `${grandTotalKr} kr.`,
        footerNote:
          "Vi har lagt drikkevarerne til din bestilling. Vi glæder os til at se dig i Bakkens Hvile, Dyrehavsbakken 38, 2930 Klampenborg.",
      }),
    });
  } catch (err) {
    console.error("Genbestilling: bekræftelsen kunne ikke sendes", {
      bookingNo: payment.bookingNo,
    });
    await advarOmManglendeBekraeftelse({
      bookingNo: payment.bookingNo,
      kundeNavn: payment.customerName,
      kundeEmail: payment.customerEmail,
    });
  }
}
