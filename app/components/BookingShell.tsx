import "./booking.css";

export default function BookingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bh-cream)",
        minHeight: "100vh",
      }}
    >
      {children}
    </div>
  );
}
