// src/lib/rate-limit.ts
// Fixed-window rate limiter. Prefers Redis (Upstash) — one atomic INCR+EXPIRE per
// check, far cheaper than two Postgres round-trips through the small pooler, which
// matters on the per-chat-message hot path. Falls back to the DB limiter when
// Redis isn't configured OR errors (so behavior is never worse than the proven
// DB path). Both fail OPEN by default (a DB-backed op fails anyway, so the bypass
// opens nothing); a CPU-heavy non-DB caller can pass failClosed to block instead.
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger("rate-limit");

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: Date }
  | { allowed: false; remaining: 0; resetAt: Date; retryAfterSeconds: number };

// Atomic fixed window: INCR the counter; on the first hit set the TTL; return the
// count + remaining TTL. One round-trip, no incr/expire race (a process death
// between two separate ops could otherwise leave a counter with no expiry).
const WINDOW_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {c, redis.call('PTTL', KEYS[1])}
`;

async function rateLimitRedis(key: string, maxHits: number, windowMs: number): Promise<RateLimitResult> {
  const res = await redis!.eval(WINDOW_LUA, [`rl:${key}`], [windowMs]);
  // Guard the shape — a malformed result throws here and we degrade to the DB path
  // (caller's try/catch), rather than computing on undefined and wrongly allowing.
  if (!Array.isArray(res) || typeof res[0] !== "number") throw new Error("unexpected eval result");
  const [count, ttlMs] = res as [number, number];
  const remainingMs = ttlMs > 0 ? ttlMs : windowMs;
  const resetAt = new Date(Date.now() + remainingMs);
  if (count > maxHits) {
    return { allowed: false, remaining: 0, resetAt, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
  }
  return { allowed: true, remaining: Math.max(0, maxHits - count), resetAt };
}

/**
 * Check + increment a counter. Returns whether the request should be allowed.
 *
 * @param key      Identifier like "award:1.2.3.4" or "claim:userId" — must be stable per actor.
 * @param maxHits  How many requests are allowed within the window.
 * @param windowMs Window length in milliseconds.
 */
export async function rateLimit(
  key: string,
  maxHits: number,
  windowMs: number,
  opts?: { failClosed?: boolean },
): Promise<RateLimitResult> {
  if (redis) {
    try {
      return await rateLimitRedis(key, maxHits, windowMs);
    } catch (e) {
      // Redis hiccup → degrade to the proven DB limiter (NOT straight to fail-open).
      log.warn("redis rate-limit failed, falling back to DB", { error: (e as Error).message });
    }
  }
  return rateLimitDb(key, maxHits, windowMs, opts?.failClosed ?? false);
}

/** Prisma unique/primary-key violation — here it means a concurrent request created the bucket. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "P2002";
}

async function rateLimitDb(
  key: string,
  maxHits: number,
  windowMs: number,
  failClosed = false,
): Promise<RateLimitResult> {
  const now = new Date();
  try {
    return await rateLimitDbOnce(key, maxHits, windowMs, now);
  } catch (e) {
    // A racing FIRST hit: two requests both saw no bucket, one `create` won and the other
    // hit P2002 on the primary key. That is NOT a DB outage — the bucket now exists, so retry
    // once as an increment. Previously this fell into the fail-open branch below and silently
    // dropped the hit (returning a bogus remaining=maxHits) — anti-brute-force weakened (#qa D-1).
    if (isUniqueViolation(e)) {
      try {
        return await rateLimitDbOnce(key, maxHits, windowMs, new Date());
      } catch (e2) {
        return dbFailure(e2, maxHits, windowMs, now, failClosed);
      }
    }
    return dbFailure(e, maxHits, windowMs, now, failClosed);
  }
}

/** One find-or-create-or-increment pass. Throws (incl. P2002) to the retry/fallback wrapper. */
async function rateLimitDbOnce(
  key: string,
  maxHits: number,
  windowMs: number,
  now: Date,
): Promise<RateLimitResult> {
  const windowStart = new Date(now.getTime() - windowMs);

  // Find bucket, drop if expired
  let bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });
  if (bucket && bucket.windowStart < windowStart) {
    // Window expired — reset
    bucket = await prisma.rateLimitBucket.update({
      where: { key },
      data: { count: 1, windowStart: now, expiresAt: new Date(now.getTime() + windowMs) },
    });
    return { allowed: true, remaining: maxHits - 1, resetAt: bucket.expiresAt };
  }

  if (!bucket) {
    // May throw P2002 if a concurrent request created it first — the wrapper retries.
    bucket = await prisma.rateLimitBucket.create({
      data: { key, count: 1, windowStart: now, expiresAt: new Date(now.getTime() + windowMs) },
    });
    return { allowed: true, remaining: maxHits - 1, resetAt: bucket.expiresAt };
  }

  if (bucket.count >= maxHits) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000));
    return { allowed: false, remaining: 0, resetAt: bucket.expiresAt, retryAfterSeconds };
  }

  const updated = await prisma.rateLimitBucket.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
  return { allowed: true, remaining: Math.max(0, maxHits - updated.count), resetAt: bucket.expiresAt };
}

/** Terminal DB failure (a genuine outage, not a create race): fail OPEN by default. */
function dbFailure(e: unknown, maxHits: number, windowMs: number, now: Date, failClosed: boolean): RateLimitResult {
  // DB-backed endpoints fail OPEN (the underlying write fails anyway, so bypassing
  // the limit opens nothing); CPU-heavy non-DB callers (e.g. the OG render) pass
  // failClosed so an outage can't turn the limiter into an amplifier.
  log.error(`DB error, ${failClosed ? "blocking" : "allowing"} request`, e);
  if (failClosed) {
    const retryAfterSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    return { allowed: false, remaining: 0, resetAt: new Date(now.getTime() + windowMs), retryAfterSeconds };
  }
  return { allowed: true, remaining: maxHits, resetAt: new Date(now.getTime() + windowMs) };
}

/** Cheap helper to add Retry-After header to a 429 response. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  if (result.allowed) {
    return {
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
    };
  }
  return {
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
    "Retry-After": String(result.retryAfterSeconds),
  };
}
