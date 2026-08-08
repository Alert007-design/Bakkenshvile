import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";
import { PAGES } from "@/lib/seo";

// XML-sitemap — genereres af Next på /sitemap.xml ud fra sideregistret i
// lib/seo.ts. Kun kanoniske, indekserbare sider medtages (ingen noindex-,
// redirect- eller sessionssider). lastmod udelades bevidst: vi har ingen
// pålidelig pr.-side-ændringsdato, og en opdigtet værdi er værre end ingen.
export default function sitemap(): MetadataRoute.Sitemap {
  const site = siteUrl();
  return Object.values(PAGES).map((page) => ({
    url: page.path === "/" ? `${site}/` : `${site}${page.path}`,
  }));
}
