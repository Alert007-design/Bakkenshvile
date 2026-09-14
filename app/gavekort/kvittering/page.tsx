import BookingShell from "../../components/BookingShell";
import { getDb } from "@/lib/db";
import { getGiftCardByRef } from "@/lib/gift-cards";
import { vivaProvider } from "@/lib/payments/viva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Kvittering — gavekort — Bakkens Hvile",
  description: "Bekræftelse af dit køb af gavekort hos Bakkens Hvile.",
  robots: { index: false, follow: false },
};

// Vivas success-URL for gavekort-sourcen. Viva hægter ?s={orderCode}&t={txn} på.
// Siden VISER ALDRIG "gennemført", medmindre betalingen er verificeret hos Viva
// OG matcher et gyldigt gavekort. Ren læsning — koden dannes og mailes i
// webhooken, ikke her.
type ConfirmResult =
  | { ok: false }
  | { ok: true; recipientEmail: string; amountKr: number };

async function confirmPayment(orderCode: string, transactionId: string): Promise<ConfirmResult> {
  if (!transactionId || !orderCode) return { ok: false };
  try {
    const card = await getGiftCardByRef(getDb(), orderCode);
    if (!card) return { ok: false };
    const verified = await vivaProvider.verifyPayment({ paymentRef: orderCode, transactionId });
    if (!verified || verified.status !== "paid") return { ok: false };
    if (
      verified.amountOre !== card.amountOre ||
      verified.currency.toLowerCase() !== card.currency.toLowerCase()
    ) {
      return { ok: false };
    }
    return { ok: true, recipientEmail: card.recipientEmail, amountKr: Math.round(card.amountOre / 100) };
  } catch {
    return { ok: false };
  }
}

export default async function GavekortKvitteringPage({
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
              Hvis beløbet er trukket, sender vi gavekortet til modtageren på
              e-mail, så snart betalingen er registreret. Du er også velkommen til
              at kontakte os, hvis noget driller.
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
          <h2 style={{ color: "var(--bh-cream)", marginTop: 8 }}>Tak for dit gavekort!</h2>
          <p style={{ opacity: 0.8, fontSize: 14 }}>
            Gavekortet på {confirmed.amountKr} kr. er sendt til {confirmed.recipientEmail} med
            en unik kode. Du modtager selv en kvittering på e-mail. Gavekortet er
            gyldigt i 3 år.
          </p>
        </div>
      </div>
    </BookingShell>
  );
}
