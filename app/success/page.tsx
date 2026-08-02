import BookingShell from "../components/BookingShell";
import { getDb } from "@/lib/db";
import { getTicketPayment } from "@/lib/ticket-payments";
import { vivaProvider } from "@/lib/payments/viva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Kvittering — Bakkens Hvile",
  description: "Bekræftelse af din betaling hos Bakkens Hvile.",
  robots: { index: false, follow: false },
};

// Vivas fælles success-URL (sat på tickets-sourcen). Viva hægter selv
// ?s={orderCode}&t={transactionId}&lang=.. på — den bærer IKKE vores bookingnr.
//
// Siden VISER ALDRIG "Betaling gennemført", medmindre betalingen er verificeret
// server-side hos Viva OG matcher en gyldig ordre (rigtigt orderCode, beløb og
// valuta). En genindlæsning verificerer blot igen — der oprettes eller behandles
// aldrig noget her (fulfillment sker i webhooken; denne side er ren læsning).
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: { s?: string; t?: string };
}) {
  const orderCode = typeof searchParams.s === "string" ? searchParams.s : "";
  const transactionId = typeof searchParams.t === "string" ? searchParams.t : "";

  const confirmed = await confirmPayment(orderCode, transactionId);

  if (!confirmed.ok) {
    return (
      <BookingShell>
        <div className="page">
          <div className="confirmation ticket-edge">
            <div className="eyebrow" style={{ color: "var(--bh-gold)" }}>
              Betaling ikke bekræftet
            </div>
            <h2 style={{ color: "var(--bh-cream)", marginTop: 8 }}>
              Vi kunne ikke bekræfte betalingen.
            </h2>
            <p style={{ opacity: 0.8, fontSize: 14 }}>
              Hvis beløbet er trukket, får du en bekræftelse på e-mail, så snart
              betalingen er registreret. Du er også velkommen til at kontakte os,
              hvis noget driller.
            </p>
          </div>
        </div>
      </BookingShell>
    );
  }

  return (
    <BookingShell>
      <div className="page">
        <div className="confirmation ticket-edge">
          <div className="eyebrow" style={{ color: "var(--bh-gold)" }}>
            Betaling gennemført
          </div>
          <h2 style={{ color: "var(--bh-cream)", marginTop: 8 }}>
            {confirmed.isReorder
              ? "Tak for din ekstra bestilling!"
              : "Tak for din booking!"}
          </h2>
          {confirmed.bookingNo && <p className="mono">{confirmed.bookingNo}</p>}
          <p style={{ opacity: 0.8, fontSize: 14 }}>
            {confirmed.isReorder
              ? "Vi har lagt drikkevarerne til din bestilling. Du modtager en bekræftelse på e-mail snarest."
              : "Du modtager en bekræftelse på e-mail snarest. Vi glæder os til at se dig i Bakkens Hvile."}
          </p>
        </div>
      </div>
    </BookingShell>
  );
}

type ConfirmResult =
  | { ok: false }
  | { ok: true; bookingNo: string; isReorder: boolean };

/**
 * Verificerer server-side hos Viva, at betalingen er gennemført og hører til en
 * gyldig ordre. Uden gyldig transaktion/orderCode, ubetalt status eller beløb/
 * valuta der ikke matcher den oprindelige ordre, returneres { ok: false }.
 */
async function confirmPayment(
  orderCode: string,
  transactionId: string
): Promise<ConfirmResult> {
  // Uden en transaktionsidentifikation kan intet verificeres (fail-closed).
  if (!transactionId || !orderCode) return { ok: false };

  try {
    // Ordren SKAL findes i vores egen billet-ledger (og bære det forventede beløb).
    const payment = await getTicketPayment(getDb(), orderCode);
    if (!payment) return { ok: false };

    // Hent transaktionen hos Viva og bekræft, at dens orderCode matcher (kaster
    // ellers), og at status er "paid".
    const verified = await vivaProvider.verifyPayment({
      paymentRef: orderCode,
      transactionId,
    });
    if (!verified || verified.status !== "paid") return { ok: false };

    // Beløb og valuta skal stemme med den oprindelige ordre.
    if (
      verified.amountOre !== payment.expectedTotalOre ||
      verified.currency.toLowerCase() !== payment.currency.toLowerCase()
    ) {
      return { ok: false };
    }

    return {
      ok: true,
      bookingNo: payment.bookingNo,
      isReorder: payment.flow === "genbestil",
    };
  } catch {
    // Enhver fejl (mismatch, netværk, ukendt transaktion) → ingen falsk bekræftelse.
    return { ok: false };
  }
}
