// src/lib/rate-limit.ts
// DB-backed sliding window rate limiter. Survives serverless cold starts and
// is consistent across Vercel instances. Cheap (one upsert + count per request).
import { prisma } from "@/lib/prisma";

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: Date }
  | { allowed: false; remaining: 0; resetAt: Date; retryAfterSeconds: number };

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
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  try {
    // Find bucket, drop if expired
    let bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });
    if (bucket && bucket.windowStart < windowStart) {
      // Window expired — reset
      bucket = await prisma.rateLimitBucket.update({
        where: { key },
        data: {
          count: 1,
          windowStart: now,
          expiresAt: new Date(now.getTime() + windowMs),
        },
      });
      return {
        allowed: true,
        remaining: maxHits - 1,
        resetAt: bucket.expiresAt,
      };
    }

    if (!bucket) {
      bucket = await prisma.rateLimitBucket.create({
        data: {
          key,
          count: 1,
          windowStart: now,
          expiresAt: new Date(now.getTime() + windowMs),
        },
      });
      return {
        allowed: true,
        remaining: maxHits - 1,
        resetAt: bucket.expiresAt,
      };
    }

    if (bucket.count >= maxHits) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000),
      );
      return {
        allowed: false,
        remaining: 0,
        resetAt: bucket.expiresAt,
        retryAfterSeconds,
      };
    }

    const updated = await prisma.rateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return {
      allowed: true,
      remaining: Math.max(0, maxHits - updated.count),
      resetAt: bucket.expiresAt,
    };
  } catch (e) {
    // On DB error — fail-open (don't block legitimate traffic).
    console.error("[rate-limit] DB error, allowing request:", e);
    return { allowed: true, remaining: maxHits, resetAt: new Date(now.getTime() + windowMs) };
  }
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
