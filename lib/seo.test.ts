// SEO-kvalitetstest (automatiseret del af SEO-arbejdet):
// - alle indekserbare sider har unik titel, beskrivelse og canonical
// - sitemap dækker præcis sideregistret og ingen interne ruter
// - robots blokerer interne/transaktionssider men aldrig de offentlige
// - JSON-LD er valid JSON, uden opfundne priser eller anmeldelser

import { describe, expect, it } from "vitest";
import {
  PAGES,
  pageMetadata,
  organizationGraph,
  eventsJsonLd,
  performersJsonLd,
  faqJsonLd,
  breadcrumbs,
  type PageKey,
} from "@/lib/seo";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { siteUrl } from "@/lib/site-url";
import type { ShowDate } from "@/lib/events";

const keys = Object.keys(PAGES) as PageKey[];

describe("sideregistret (PAGES)", () => {
  it("har unikke stier, titler og beskrivelser", () => {
    const paths = keys.map((k) => PAGES[k].path);
    const titles = keys.map((k) => PAGES[k].title);
    const descriptions = keys.map((k) => PAGES[k].description);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("holder titler og beskrivelser i fornuftige længder", () => {
    for (const k of keys) {
      expect(PAGES[k].title.length, `titel for ${k}`).toBeGreaterThan(10);
      expect(PAGES[k].title.length, `titel for ${k}`).toBeLessThanOrEqual(75);
      expect(PAGES[k].description.length, `beskrivelse for ${k}`).toBeGreaterThan(50);
      expect(PAGES[k].description.length, `beskrivelse for ${k}`).toBeLessThanOrEqual(320);
    }
  });

  it("bygger metadata med canonical = sidens sti", () => {
    for (const k of keys) {
      const meta = pageMetadata(k);
      expect(meta.alternates?.canonical, `canonical for ${k}`).toBe(PAGES[k].path);
      expect(meta.title).toBe(PAGES[k].title);
      expect(meta.description).toBe(PAGES[k].description);
    }
  });

  it("sætter kun hreflang på forside og engelsk side (da-DK ↔ en)", () => {
    for (const k of keys) {
      const languages = pageMetadata(k).alternates?.languages;
      if (k === "forside" || k === "english") {
        expect(languages).toEqual({ "da-DK": "/", en: "/en" });
      } else {
        expect(languages, `hreflang for ${k}`).toBeUndefined();
      }
    }
  });
});

describe("sitemap", () => {
  it("indeholder præcis de kanoniske offentlige sider", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.length).toBe(keys.length);
    for (const k of keys) {
      const expected =
        PAGES[k].path === "/" ? `${siteUrl()}/` : `${siteUrl()}${PAGES[k].path}`;
      expect(urls, `sitemap mangler ${k}`).toContain(expected);
    }
  });

  it("indeholder ingen interne, noindex- eller transaktionsruter", () => {
    const urls = sitemap().map((e) => e.url);
    for (const forbudt of [
      "/admin",
      "/bar",
      "/funktioner",
      "/login",
      "/bord",
      "/genbestil",
      "/success",
      "/afbrudt",
      "/api",
    ]) {
      expect(
        urls.some((u) => new URL(u).pathname.startsWith(forbudt)),
        `sitemap må ikke indeholde ${forbudt}`
      ).toBe(false);
    }
  });
});

describe("robots", () => {
  const conf = robots();
  const rules = Array.isArray(conf.rules) ? conf.rules : [conf.rules];
  const rule = rules[0]!;
  const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];

  it("tillader alle crawlere på offentlige sider og henviser til sitemap", () => {
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
    expect(conf.sitemap).toBe(`${siteUrl()}/sitemap.xml`);
  });

  it("blokerer interne og transaktionssider — men ingen offentlige sider", () => {
    for (const path of ["/admin", "/bar", "/funktioner", "/login", "/api/", "/bord/"]) {
      expect(disallow, `robots skal blokere ${path}`).toContain(path);
    }
    // Ingen offentlig side i registret må være blokeret.
    for (const k of keys) {
      const blocked = disallow.some(
        (d) => d && d !== "/" && PAGES[k].path.startsWith(d.replace(/\/$/, ""))
      );
      expect(blocked, `robots må ikke blokere ${PAGES[k].path}`).toBe(false);
    }
  });
});

describe("JSON-LD", () => {
  it("organizationGraph er valid JSON med verificerede stamdata", () => {
    const graph = JSON.parse(JSON.stringify(organizationGraph()));
    const org = graph["@graph"].find((n: any) => n["@type"] === "Organization");
    expect(org.foundingDate).toBe("1877");
    expect(org.address.streetAddress).toBe("Dyrehavsbakken 38");
    expect(org.address.postalCode).toBe("2930");
    expect(org.address.addressLocality).toBe("Klampenborg");
    expect(org.sameAs.length).toBeGreaterThanOrEqual(2);
    // Ingen self-serving ratings i structured data.
    expect(JSON.stringify(graph)).not.toContain("aggregateRating");
    expect(JSON.stringify(graph)).not.toContain("Review");
  });

  it("eventsJsonLd bygger events af samme datakilde uden opfundne priser", () => {
    const shows: ShowDate[] = [
      {
        id: "rec1",
        title: "Sommershow",
        date: "2027-06-12",
        time: "19:30",
        duration: "",
        notes: "",
        priceGroup: "A",
        soldOut: false,
      },
      {
        id: "rec2",
        title: "Udsolgt aften",
        date: "2027-06-13",
        time: "",
        duration: "",
        notes: "",
        priceGroup: "A",
        soldOut: true,
      },
      // Ugyldig dato må aldrig blive til et Event.
      {
        id: "rec3",
        title: "Fejlpost",
        date: "",
        time: "",
        duration: "",
        notes: "",
        priceGroup: "A",
        soldOut: false,
      },
    ];
    const events = eventsJsonLd(shows);
    expect(events.length).toBe(2);
    expect(events[0].startDate).toBe("2027-06-12T19:30:00");
    expect(events[0].offers.availability).toBe("https://schema.org/InStock");
    expect(events[1].startDate).toBe("2027-06-13");
    expect(events[1].offers.availability).toBe("https://schema.org/SoldOut");
    // Priser beregnes serverside pr. billettype og må ikke opfindes i schema.
    expect(JSON.stringify(events)).not.toContain('"price"');
    for (const e of events) {
      expect(e.eventStatus).toBe("https://schema.org/EventScheduled");
      expect(e.location.address.addressLocality).toBe("Klampenborg");
    }
  });

  it("performersJsonLd indeholder hele den navngivne besætning", () => {
    const group = JSON.parse(JSON.stringify(performersJsonLd()));
    const names = group.member.map((m: any) => m.name);
    expect(names).toContain("Dot Wessman");
    expect(names).toContain("Kenneth Sichlau");
    expect(group.member.every((m: any) => m.image && m.jobTitle)).toBe(true);
  });

  it("faqJsonLd afspejler præcis de synlige spørgsmål/svar", () => {
    const faq = faqJsonLd([{ question: "Hvad er Bakkens Hvile?", answer: "En scene." }]);
    expect(faq.mainEntity.length).toBe(1);
    expect(faq.mainEntity[0].name).toBe("Hvad er Bakkens Hvile?");
    expect(faq.mainEntity[0].acceptedAnswer.text).toBe("En scene.");
  });

  it("breadcrumbs nummererer fra 1 og bruger absolutte URL'er", () => {
    const bc = breadcrumbs([
      ["Forside", "/"],
      ["Historien", "/historie"],
    ]);
    expect(bc.itemListElement[0].position).toBe(1);
    expect(bc.itemListElement[1].item).toBe(`${siteUrl()}/historie`);
  });
});
