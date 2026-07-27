import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  airtableFetch,
  cachedListRecords,
  clearAirtableCache,
} from "@/lib/airtable";

// Hjælper: byg et Response-lignende objekt.
function res(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  process.env.AIRTABLE_TOKEN = "test-token";
  process.env.AIRTABLE_BASE_ID = "appTest";
  clearAirtableCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("airtableFetch — backoff og 429", () => {
  it("prøver igen ved 429 og returnerer til sidst succes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(res(429))
      .mockResolvedValueOnce(res(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await airtableFetch("https://x", {}, { baseDelayMs: 1 });
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("prøver igen ved 5xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await airtableFetch("https://x", {}, { baseDelayMs: 1 });
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("giver op efter maks forsøg og returnerer det sidste (fejl)svar", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(429));
    vi.stubGlobal("fetch", fetchMock);

    const r = await airtableFetch("https://x", {}, { retries: 2, baseDelayMs: 1 });
    expect(r.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("returnerer straks ved 4xx (ikke 429) uden retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404));
    vi.stubGlobal("fetch", fetchMock);

    const r = await airtableFetch("https://x", {}, { baseDelayMs: 1 });
    expect(r.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("cachedListRecords — TTL og stale-on-error", () => {
  it("cacher inden for TTL (kun ét Airtable-kald)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(res(200, { records: [{ id: "rec1", fields: {} }] }));
    vi.stubGlobal("fetch", fetchMock);

    let now = 1000;
    const clock = () => now;
    const a = await cachedListRecords("tbl", 30000, clock);
    now = 5000; // inden for TTL
    const b = await cachedListRecords("tbl", 30000, clock);

    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("henter igen efter TTL er udløbet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(res(200, { records: [{ id: "rec1", fields: {} }] }));
    vi.stubGlobal("fetch", fetchMock);

    let now = 1000;
    const clock = () => now;
    await cachedListRecords("tbl", 1000, clock);
    now = 3000; // efter TTL
    await cachedListRecords("tbl", 1000, clock);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stale-on-error: returnerer sidste gode data hvis Airtable fejler", async () => {
    vi.useFakeTimers();
    try {
      const good = res(200, { records: [{ id: "rec1", fields: { n: 1 } }] });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(good) // første kald: OK, cacher
        .mockResolvedValue(res(500)); // senere kald fejler vedvarende
      vi.stubGlobal("fetch", fetchMock);

      let now = 1000;
      const clock = () => now;
      const first = await cachedListRecords("tbl", 100, clock);
      now = 10000; // TTL udløbet → refetch fejler (med backoff-forsøg)
      const p = cachedListRecords("tbl", 100, clock);
      await vi.runAllTimersAsync(); // flush backoff-sleeps
      const second = await p;

      expect(second).toEqual(first); // baren stopper ikke — får stale data
    } finally {
      vi.useRealTimers();
    }
  });

  it("kaster hvis der ikke findes cachede data OG Airtable fejler", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(500)));
      const p = cachedListRecords("tbl", 100, () => 1);
      const assertion = expect(p).rejects.toThrow();
      await vi.runAllTimersAsync(); // flush backoff-sleeps
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
