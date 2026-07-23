import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bakkens Hvile — Skønsang & samfundssatire på Dyrehavsbakken",
  description:
    "Bakkens Hvile er scenen for bakkesangerinderne på Dyrehavsbakken i Klampenborg. Snart 150 år med skønsang og syngende samfundssatire.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="da">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;0,900;1,600&family=Work+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
