import BookingShell from "../components/BookingShell";
import { getDb } from "@/lib/db";
import { getTicketPayment } from "@/lib/ticket-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vivas fælles success-URL (sat på tickets-sourcen). Viva hægter selv
// ?s={orderCode}&t={transactionId}&lang=.. på — den bærer IKKE vores bookingnr.
// Vi slår derfor orderCode (?s) op i ledgeren for at vise bookingnummeret og
// afgøre, om det var en genbestilling. orderCode er ikke hemmelig og giver kun
// adgang til et bookingnummer, gæsten i forvejen har.
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: { booking?: string; genbestil?: string; s?: string };
}) {
  let bookingNo = searchParams.booking ?? "";
  let isReorder = searchParams.genbestil === "1";

  const orderCode = searchParams.s;
  if (orderCode) {
    try {
      const payment = await getTicketPayment(getDb(), orderCode);
      if (payment) {
        bookingNo = payment.bookingNo;
        isReorder = payment.flow === "genbestil";
      }
    } catch {
      // Betalingen er gennemført uanset — vis blot den generiske kvittering.
    }
  }

  return (
    <BookingShell>
      <div className="page">
        <div className="confirmation ticket-edge">
          <div className="eyebrow" style={{ color: "var(--bh-gold)" }}>
            Betaling gennemført
          </div>
          <h2 style={{ color: "var(--bh-cream)", marginTop: 8 }}>
            {isReorder ? "Tak for din ekstra bestilling!" : "Tak for din booking!"}
          </h2>
          {bookingNo && <p className="mono">{bookingNo}</p>}
          <p style={{ opacity: 0.8, fontSize: 14 }}>
            {isReorder
              ? "Vi har lagt drikkevarerne til din bestilling. Du modtager en bekræftelse på email snarest."
              : "Du modtager en bekræftelse på email snarest. Vi glæder os til at se dig i Bakkens Hvile."}
          </p>
        </div>
      </div>
    </BookingShell>
  );
}
