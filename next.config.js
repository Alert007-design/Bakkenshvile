/** @type {import('next').NextConfig} */

// 301-redirects fra det gamle sites URL'er til de nye. Udfyldes FØR
// domæneskiftet (go-live-tjekliste punkt 4). Skaf listen over gamle URL'er fra
// Search Console eller serverloggen, og map hver enkelt til den mest PRÆCISE
// nye sti — aldrig blindt alt til forsiden, det spolerer den SEO, vi flytter
// med over.
//
// Format pr. linje: { source: "<gammel sti>", destination: "<ny sti>", permanent: true }
// `permanent: true` sender 301 (varig). Eksterne mål kræver fuld URL.
// Tom liste nu = ingen redirects (no-op). Wildcards: "/gammel/:slug" → "/nyt/:slug".
//
// Kortlagt fra det gamle WordPress-site 14. sep. 2026. Next normaliserer selv
// efterstillet skråstreg (/x/ → /x), så source skrives UDEN skråstreg.
//
// Bemærk to ting, der IKKE kan løses her:
//  - Subdomænerne billetter.bakkenshvile.dk og billetadmin.bakkenshvile.dk er
//    det gamle TicketCloud-system på en anden vært. De erstattes af /book og
//    kan ikke redirectes fra Next — det skal ske i DNS/hosting ved udfasning.
//  - /foredrag var allerede fjernet (404) på det gamle site og udelades derfor,
//    indtil det er afklaret, om den skal genskabes eller pege et bestemt sted.
const REDIRECTS = [
  // Sangerinde-undersider → den samlede oversigt.
  { source: "/sangerinder/tinagrunwald", destination: "/sangerinderne", permanent: true },
  { source: "/sangerinder/sus-mathiasen", destination: "/sangerinderne", permanent: true },
  { source: "/sangerinder/dot-wessman", destination: "/sangerinderne", permanent: true },
  { source: "/sangerinder/annfarholt", destination: "/sangerinderne", permanent: true },
  // Booking af sangerinderne til fest/arrangement.
  { source: "/vil-du-booke-syngepigerne", destination: "/underholdning-til-fest", permanent: true },
  // Kontaktsiden → praktisk information (adresse + kontakt).
  { source: "/kontakt", destination: "/praktisk", permanent: true },
];

const nextConfig = {
  images: {
    // Moderne formater til next/image-optimering: AVIF først (mindst),
    // WebP som fallback. Originalfilerne i public/ røres ikke.
    formats: ["image/avif", "image/webp"],
  },

  // Next læser denne asynkront ved build/start. Returnerer den tomme liste,
  // indtil de gamle URL'er er kortlagt.
  async redirects() {
    return REDIRECTS;
  },
};

module.exports = nextConfig;
