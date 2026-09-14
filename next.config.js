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
// Eksempel (fjern kommentaren og tilret, når de rigtige URL'er foreligger):
//   { source: "/billetter", destination: "/book", permanent: true },
//   { source: "/om-os", destination: "/historie", permanent: true },
const REDIRECTS = [
  // TODO(redaktion): indsæt 301-mapping fra det gamle site her før domæneskiftet.
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
