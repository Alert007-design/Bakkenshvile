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

/**
 * Login-throttling med midlertidig spærring. To lag pr. nøgle (typisk IP):
 *  - Kortvindue: højst `burst` forsøg pr. `burstWindowMs` (fx 6 pr. minut).
 *  - Spærrevindue: højst `lock` forsøg pr. `lockWindowMs` (fx 20 pr. 15 min.),
 *    hvorefter yderligere forsøg afvises resten af vinduet.
 * Registrerer altid forsøget i begge lag. `ok=false` med `retryAfterMs`, når et
 * af lagene er opbrugt (den længste ventetid returneres). now() injiceres til test.
 */
export function loginThrottle(
  key: string,
  now: () => number = Date.now
): RateLimitResult {
  const burst = rateLimit(`login-burst:${key}`, 6, 60_000, now);
  const lock = rateLimit(`login-lock:${key}`, 20, 15 * 60_000, now);
  if (burst.ok && lock.ok) {
    return { ok: true, remaining: Math.min(burst.remaining, lock.remaining), retryAfterMs: 0 };
  }
  return {
    ok: false,
    remaining: 0,
    retryAfterMs: Math.max(burst.retryAfterMs, lock.retryAfterMs),
  };
}

/** Kun til test. */
export function __clearRateLimits() {
  buckets.clear();
}
