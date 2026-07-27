// Simpel in-memory rate limiter (sliding window pr. nøgle). Til serverless er
// dette pr. instans — tilstrækkeligt som førstelinjeværn mod dobbeltklik og
// hurtige gentagne forsøg. En delt Redis/DB-limiter kan tilføjes senere hvis
// nødvendigt.

type Bucket = number[]; // tidsstempler (ms) inden for vinduet
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Registrerer et forsøg for en nøgle og afgør om det er tilladt. Højst `limit`
 * forsøg pr. `windowMs`. now() injiceres til test.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: () => number = Date.now
): RateLimitResult {
  const t = now();
  const cutoff = t - windowMs;
  const recent = (buckets.get(key) ?? []).filter((ts) => ts > cutoff);

  if (recent.length >= limit) {
    const oldest = recent[0];
    buckets.set(key, recent);
    return { ok: false, remaining: 0, retryAfterMs: oldest + windowMs - t };
  }

  recent.push(t);
  buckets.set(key, recent);
  return { ok: true, remaining: limit - recent.length, retryAfterMs: 0 };
}

/** Kun til test. */
export function __clearRateLimits() {
  buckets.clear();
}
