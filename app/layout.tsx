import type { Metadata } from "next";
import { siteUrl } from "@/lib/site-url";
import { SITE_NAME, OG_BILLEDE } from "@/lib/site-config";
import { PAGES } from "@/lib/seo";
import "./globals.css";

const SITE = siteUrl();

// Globale metadata-standarder. Hver offentlig side sætter sin EGEN unikke
// titel, beskrivelse, canonical og Open Graph via pageMetadata() i lib/seo.ts —
// værdierne her er kun fallback for sider uden egne metadata (interne/noindex).
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: PAGES.forside.title,
  description: PAGES.forside.description,
  openGraph: {
    title: PAGES.forside.title,
    description: PAGES.forside.description,
    url: `${SITE}/`,
    siteName: SITE_NAME,
    locale: "da_DK",
    type: "website",
    images: [
      {
        url: `${SITE}${encodeURI(OG_BILLEDE.src)}`,
        width: OG_BILLEDE.bredde,
        height: OG_BILLEDE.hoejde,
        alt: OG_BILLEDE.alt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGES.forside.title,
    description: PAGES.forside.description,
    images: [`${SITE}${encodeURI(OG_BILLEDE.src)}`],
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
