import Link from "next/link";
import BookingShell from "../../components/BookingShell";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Betaling afbrudt — gavekort — Bakkens Hvile",
  description: "Betalingen for gavekortet blev ikke gennemført.",
  robots: { index: false, follow: false },
};

// Vivas failure/cancel-URL for gavekort-sourcen. ?cancel sættes, når gæsten selv
// afbrød. Ingen ordreadgang gives via query — ren informationsside.
export default function GavekortAfbrudtPage({
  searchParams,
}: {
  searchParams: { cancel?: string };
}) {
  const cancelled = searchParams.cancel !== undefined;
  return (
    <BookingShell>
      <div className="page">
        <div className="confirmation ticket-edge">
          <div className="eyebrow" style={{ color: "var(--bh-gold)" }}>
            {cancelled ? "Betaling afbrudt" : "Betaling ikke gennemført"}
          </div>
          <h2 style={{ color: "var(--bh-cream)", marginTop: 8 }}>
            {cancelled ? "Du afbrød betalingen." : "Betalingen blev ikke gennemført."}
          </h2>
          <p style={{ opacity: 0.8, fontSize: 14 }}>
            Der er ikke trukket noget beløb. Du er velkommen til at prøve igen.
          </p>
          <p style={{ marginTop: 16 }}>
            <Link href="/gavekort" className="ctaGold" style={{ padding: "12px 24px" }}>
              Tilbage til gavekort
            </Link>
          </p>
        </div>
      </div>
    </BookingShell>
  );
}
