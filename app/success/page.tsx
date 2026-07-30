import BookingShell from "../components/BookingShell";

export default function SuccessPage({
  searchParams,
}: {
  searchParams: { booking?: string; genbestil?: string };
}) {
  const isReorder = searchParams.genbestil === "1";
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
          {searchParams.booking && (
            <p className="mono">{searchParams.booking}</p>
          )}
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
