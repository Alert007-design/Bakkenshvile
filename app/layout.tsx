import type { Metadata } from "next";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const SITE = siteUrl();
const TITLE = "Bakkens Hvile — Skønsang & samfundssatire på Dyrehavsbakken";
const DESCRIPTION =
  "Bakkens Hvile er scenen for bakkesangerinderne på Dyrehavsbakken i Klampenborg. Snart 150 år med skønsang og syngende samfundssatire.";
// Delebillede til Facebook/sociale medier. Peger på et eksisterende foto via
// sitets kanoniske URL, så det virker uanset domæne.
const OG_IMAGE = `${SITE}/${encodeURI("BH (1).jpeg")}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE}/`,
    siteName: "Bakkens Hvile",
    locale: "da_DK",
    type: "website",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Bakkesangerinderne på scenen i Bakkens Hvile",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
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
