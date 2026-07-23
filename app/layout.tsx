import "./globals.css";

export const metadata = {
  title: "Bakkens Hvile — Billetter",
  description: "Køb billetter og tilvalg til shows på Bakkens Hvile, Dyrehavsbakken.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
