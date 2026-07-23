import BookingShell from "../components/BookingShell";

export default function SuccessPage({
  searchParams,
}: {
  searchParams: { booking?: string };
}) {
  return (
    <BookingShell>
      <div className="page">
        <div className="confirmation ticket-edge">
          <div className="eyebrow" style={{ color: "var(--bh-gold)" }}>
            Betaling gennemført
          </div>
          <h2 style={{ color: "var(--bh-cream)", marginTop: 8 }}>
            Tak for din booking!
          </h2>
          {searchParams.booking && (
            <p className="mono">{searchParams.booking}</p>
          )}
          <p style={{ opacity: 0.8, fontSize: 14 }}>
            Du modtager en bekræftelse på email snarest. Vi glæder os til at
            se dig på Bakkens Hvile.
          </p>
        </div>
      </div>
    </BookingShell>
  );
}
