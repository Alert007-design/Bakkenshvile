// Fuldfører en betalt prisforskel efter en flytning til en dyrere dato
// (lib/flyt-booking.ts). Lægger beløbet på bookingens "Betalt i alt", skriver
// en note og sender en kvittering.
//
// Samme rækkefølge som genbestillingen: fejler Airtable, kastes fejlen, så
// webhooken ruller betalingen tilbage, og Viva prøver igen. Er Airtable
// opdateret, må en fejlet mail aldrig få det hele til at starte forfra (så
// lægges beløbet på to gange); kontoret får i stedet besked.

import { getRecord, updateRecord, TABLES, FIELDS } from "@/lib/airtable";
import { tilfoejNote } from "@/lib/annuller-booking";
import { orderEmailHtml } from "@/lib/order-email";
import { sendMail } from "@/lib/resend";
import { advarOmManglendeBekraeftelse } from "@/lib/payment-alerts";
import type { TicketPaymentRow } from "@/lib/ticket-payments";

export async function fulfillPrisforskel(payment: TicketPaymentRow): Promise<void> {
  const paidKr = Math.round(payment.expectedTotalOre / 100);
  const booking = await getRecord(TABLES.bookings, payment.bookingId);
  const prevPaid = Number(booking.fields[FIELDS.booking.totalPaid] ?? 0);
  const grandTotalKr = prevPaid + paidKr;
  await updateRecord(TABLES.bookings, payment.bookingId, {
    [FIELDS.booking.totalPaid]: grandTotalKr,
    [FIELDS.booking.specialRequests]: tilfoejNote(
      String(booking.fields[FIELDS.booking.specialRequests] ?? ""),
      `Prisforskel ${paidKr} kr. betalt`
    ),
  });

  // Herfra er bookingen opdateret. Intet må kaste længere.
  if (!payment.customerEmail) return;
  try {
    await sendMail({
      to: payment.customerEmail,
      subject: `Kvittering for prisforskel – ${payment.bookingNo}`,
      html: orderEmailHtml({
        heading: `Tak for betalingen${payment.customerName ? ", " + payment.customerName : ""}`,
        bookingNo: payment.bookingNo,
        lineItems: payment.lineItems,
        discountKr: 0,
        totalLabel: "Betalt nu",
        total: `${paidKr} kr.`,
        grandTotal: `${grandTotalKr} kr.`,
        footerNote:
          "Prisforskellen for din nye dato er betalt. Billetten med den nye dato har du allerede fået på mail. Vi glæder os til at se dig i Bakkens Hvile, Dyrehavsbakken 38, 2930 Klampenborg.",
      }),
    });
  } catch {
    console.error("Prisforskel: kvitteringen kunne ikke sendes", { bookingNo: payment.bookingNo });
    await advarOmManglendeBekraeftelse({
      bookingNo: payment.bookingNo,
      kundeNavn: payment.customerName,
      kundeEmail: payment.customerEmail,
    });
  }
}
