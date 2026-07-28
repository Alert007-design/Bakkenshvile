import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FIELDS } from "@/lib/airtable";

// Menuen læses gennem cachedListRecords → global fetch. Vi mocker fetch og
// rydder cachen mellem tests.
let menu: typeof import("@/lib/menu");
let clearCache: (t?: string) => void;

function record(id: string, fields: Record<string, unknown>) {
  return { id, fields };
}

function airtableRes(records: Array<{ id: string; fields: Record<string, unknown> }>) {
  return {
    status: 200,
    ok: true,
    headers: { get: () => null },
    json: async () => ({ records }),
    text: async () => JSON.stringify({ records }),
  } as unknown as Response;
}

// Byg et AddOns-record med field-ID'er som nøgler (returnFieldsByFieldId=true).
function addon(
  id: string,
  opts: {
    name?: string;
    price?: number;
    category?: string;
    active?: boolean;
    vat?: number;
    code?: string;
    sort?: number;
    desc?: string;
  }
) {
  return record(id, {
    [FIELDS.addOn.name]: opts.name ?? "Vare",
    [FIELDS.addOn.price]: opts.price ?? 50,
    [FIELDS.addOn.category]: opts.category ?? "Drinks",
    [FIELDS.addOn.active]: opts.active ?? true,
    ...(opts.vat !== undefined ? { [FIELDS.addOn.vatRate]: opts.vat } : {}),
    ...(opts.code !== undefined ? { [FIELDS.addOn.productCode]: opts.code } : {}),
    ...(opts.sort !== undefined ? { [FIELDS.addOn.sort]: opts.sort } : {}),
    ...(opts.desc !== undefined ? { [FIELDS.addOn.description]: opts.desc } : {}),
  });
}

beforeEach(async () => {
  process.env.AIRTABLE_TOKEN = "test-token";
  process.env.AIRTABLE_BASE_ID = "appTest";
  menu = await import("@/lib/menu");
  const at = await import("@/lib/airtable");
  clearCache = at.clearAirtableCache;
  clearCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("menu — filtrering og mapping", () => {
  it("udelader inaktive varer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        airtableRes([
          addon("rec1", { name: "Øl", active: true }),
          addon("rec2", { name: "Udsolgt", active: false }),
        ])
      )
    );
    const items = await menu.getMenuItems();
    expect(items.map((i) => i.name)).toEqual(["Øl"]);
  });

  it("udelader varer uden navn eller med pris <= 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        airtableRes([
          addon("rec1", { name: "", price: 50 }),
          addon("rec2", { name: "Gratis", price: 0 }),
          addon("rec3", { name: "Rigtig", price: 45 }),
        ])
      )
    );
    const items = await menu.getMenuItems();
    expect(items.map((i) => i.name)).toEqual(["Rigtig"]);
  });

  it("omregner pris til øre og bruger default moms 25 når intet er sat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(airtableRes([addon("rec1", { name: "Øl", price: 45 })]))
    );
    const [item] = await menu.getMenuItems();
    expect(item.unitPriceOre).toBe(4500);
    // Online-pris = 45 kr − 10% (floor pr. enhed = 4 kr) = 41 kr.
    expect(item.onlineUnitPriceOre).toBe(4100);
    expect(item.vatRate).toBe(menu.DEFAULT_VAT_RATE);
  });

  it("bruger eksplicit momssats når den er sat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(airtableRes([addon("rec1", { name: "Kaffe", vat: 12.5 })]))
    );
    const [item] = await menu.getMenuItems();
    expect(item.vatRate).toBe(12.5);
  });

  it("falder tilbage til record-id som produktkode når koden er tom", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(airtableRes([addon("rec1", { name: "Øl" })]))
    );
    const [item] = await menu.getMenuItems();
    expect(item.productCode).toBe("rec1");
  });

  it("sorterer efter Sortering, så navn", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        airtableRes([
          addon("rec1", { name: "B", sort: 2 }),
          addon("rec2", { name: "A", sort: 1 }),
          addon("rec3", { name: "C", sort: 1 }),
        ])
      )
    );
    const items = await menu.getMenuItems();
    expect(items.map((i) => i.name)).toEqual(["A", "C", "B"]);
  });
});

describe("menu — gruppering", () => {
  it("grupperer efter Kategori i defineret rækkefølge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        airtableRes([
          addon("rec1", { name: "Kaffe", category: "Kaffe" }),
          addon("rec2", { name: "Øl", category: "Fadøl" }),
          addon("rec3", { name: "Gin tonic", category: "Drinks" }),
        ])
      )
    );
    const groups = await menu.getMenuGroups();
    expect(groups.map((g) => g.group)).toEqual(["Drinks", "Fadøl", "Kaffe"]);
  });
});

describe("menu — opslagskort til checkout", () => {
  it("indeholder kun aktive varer (inaktive kan ikke købes)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        airtableRes([
          addon("rec1", { name: "Øl", active: true }),
          addon("rec2", { name: "Udsolgt", active: false }),
        ])
      )
    );
    const map = await menu.getMenuMap();
    expect(map.has("rec1")).toBe(true);
    expect(map.has("rec2")).toBe(false);
  });
});
