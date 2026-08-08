import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// robots.txt — genereres af Next på /robots.txt.
//
// Politik (bevidst): ALLE crawlere — søgemaskiner (Googlebot, Bingbot) såvel
// som AI-/svar-crawlere (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
// Claude-SearchBot, PerplexityBot, Google-Extended, CCBot) — er tilladt på de
// offentlige sider. Sitet ØNSKER at kunne citeres i søge- og AI-svar.
// En eventuel fremtidig beslutning om at blokere AI-træning (fx GPTBot eller
// Google-Extended) tilføjes som specifikke regler her — dokumentér i så fald
// konsekvensen (mistet synlighed i AI-svar) i en kommentar.
//
// Interne, transaktions- og sessionssider holdes ude af crawl. De bærer
// desuden alle noindex (page-metadata eller X-Robots-Tag via middleware), så
// de ikke indekseres ad andre veje.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/bar",
          "/funktioner",
          "/login",
          "/api/",
          "/bord/",
          "/genbestil",
          "/success",
          "/afbrudt",
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
