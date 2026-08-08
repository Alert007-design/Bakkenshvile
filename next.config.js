/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Moderne formater til next/image-optimering: AVIF først (mindst),
    // WebP som fallback. Originalfilerne i public/ røres ikke.
    formats: ["image/avif", "image/webp"],
  },
};

module.exports = nextConfig;
