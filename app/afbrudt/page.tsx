import BookingShell from "../components/BookingShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

// Vivas fælles failure-URL (sat på tickets-sourcen) for billetkøb og
// genbestilling. Viva hægter ?s, ?t og lang på, og ved gæstens annullering også
// ?cancel. Vi bruger kun ?cancel til at formulere beskeden — aldrig som adgang
// til en booking.
export default function AfbrudtPage({
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
            {cancelled ? "Betaling afbrudt" : "Betaling gik ikke igennem"}
          </div>
          <h2 style={{ color: "var(--bh-cream)", marginTop: 8 }}>
            {cancelled ? "Du afbrød betalingen" : "Betalingen blev ikke gennemført"}
          </h2>
          <p style={{ opacity: 0.8, fontSize: 14 }}>
            {cancelled
              ? "Der er ikke trukket noget. Du kan roligt prøve igen."
              : "Betalingen kunne ikke gennemføres, og der er ikke trukket noget. Prøv igen."}
          </p>
          <p style={{ marginTop: 16 }}>
            <a href="/book" style={{ color: "var(--bh-gold)", fontWeight: 600 }}>
              Tilbage til billetkøb
            </a>
          </p>
        </div>
      </div>
    </BookingShell>
  );
}
