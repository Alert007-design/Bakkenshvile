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
//  - billetadmin.bakkenshvile.dk er det gamle TicketCloud-system på en anden
//    vært og kan ikke redirectes herfra. (billetter.bakkenshvile.dk peger
//    siden 31-10-2026 på dette projekt og håndteres nederst i listen.)
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
  // Det gamle TicketCloud-billetsystem (lukket 31-10-2026). Domænet
  // billetter.bakkenshvile.dk peger nu på dette projekt i Vercel, og ALLE
  // adresser derfra (forside, gamle links til en bestemt forestilling, .php-
  // sider) sendes til billetkøbet, så ingen lander på en side, der ikke findes.
  // Gamle gavekortlinks (fx fra bakken.dk) til den nye gavekortside. Skal stå
  // før den generelle regel nedenfor, da Next bruger den første, der passer.
  {
    source: "/gavekort/:path*",
    has: [{ type: "host", value: "billetter.bakkenshvile.dk" }],
    destination: "https://bakkenshvile.dk/gavekort",
    permanent: true,
  },
  {
    source: "/:path*",
    has: [{ type: "host", value: "billetter.bakkenshvile.dk" }],
    destination: "https://bakkenshvile.dk/book",
    permanent: true,
  },
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
