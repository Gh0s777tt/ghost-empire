// src/lib/idempotency.ts
// Double-submit guard for money-moving user actions (shop buy, gift, spin, bet, …).
//
// WHY. `rateLimit` throttles bursts but is NOT idempotency: two DISTINCT-looking requests inside the
// window both run, so a double-clicked "Buy" (or a browser/network retry) charges twice. `withLock`
// only serialises concurrent casino-session reads. The `gte` balance guard stops OVERSPEND, not
// duplication — two honest duplicates with enough balance both succeed. Payment WEBHOOKS are already
// idempotent via `Transaction.externalId @unique`; USER actions (bar daily-bonus/daily-chips, which
// carry a deterministic `externalId`) had nothing. This closes that gap without a schema change.
//
// HOW. A Redis `SET NX PX` claims a short-lived slot keyed by (user, scope, token); the SECOND
// identical request inside the window loses the claim and the caller returns 409 instead of moving
// money again. The token is the client's `Idempotency-Key` header when supplied (true idempotency),
// otherwise a hash of the request body (catches the common accidental double-click of the same
// action). The claim is kept on SUCCESS (so a late re-click within the window is still blocked) and
// RELEASED on failure (so a legit retry after e.g. "insufficient funds" isn't locked out).
//
// FAIL-OPEN. With no Redis (local/dev) or on a Redis blip it returns `{ ok: true }` — a payment must
// never be blocked by the guard's own infrastructure; the underlying `$transaction` + `gte` still
// protect balance integrity, exactly as they did before this guard existed.
import { createHash } from "node:crypto";
import { redis } from "@/lib/redis";

/** Default claim window — long enough to swallow a double-click / retry, short enough not to block a
 *  deliberate repeat of the same action for long. Callers may override per route. */
export const IDEM_TTL_MS = 8000;

/** Stable short hash of a request body, so an identical resubmit maps to the same token. */
export function bodyHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex").slice(0, 24);
}

/**
 * Derive the idempotency token for a request: the client `Idempotency-Key` header wins (proper,
 * intent-scoped idempotency — a retry reuses the key, a new intent gets a new one); absent that,
 * fall back to a body hash, which catches the common case of the SAME action double-submitted.
 *
 * @param req  The incoming request (read for the optional `Idempotency-Key` header).
 * @param body The already-parsed JSON body (hashed for the fallback token).
 */
export function idempotencyToken(req: Request, body: unknown): string {
  const header = req.headers.get("Idempotency-Key");
  if (header && header.trim()) return "k:" + header.trim().slice(0, 128);
  return "b:" + bodyHash(body);
}

const idemKey = (userId: string, scope: string, token: string) => `idem:${scope}:${userId}:${token}`;

/**
 * Claim a one-shot slot for (user, scope, token). Returns `{ ok: true }` when the caller may proceed,
 * `{ ok: false }` when an identical request is already in flight / was just made (caller returns 409).
 * Fail-open (returns `ok: true`) without Redis or on a Redis error — never block a real spend on the
 * guard's infrastructure.
 *
 * @param ttlMs How long the claim (and thus the block on duplicates) lasts. Defaults to {@link IDEM_TTL_MS}.
 */
export async function claimIdempotent(
  userId: string,
  scope: string,
  token: string,
  ttlMs: number = IDEM_TTL_MS,
): Promise<{ ok: boolean }> {
  if (!redis) return { ok: true };
  try {
    const res = await redis.set(idemKey(userId, scope, token), "1", { nx: true, px: ttlMs });
    return { ok: res === "OK" };
  } catch {
    return { ok: true };
  }
}

/**
 * Release a previously claimed slot — call this when the action FAILED, so an honest retry isn't
 * locked out for the rest of the window. On success do NOT release (let the claim expire, so a late
 * duplicate click is still blocked). Best-effort; a missed delete just expires via TTL.
 */
export async function releaseIdempotent(userId: string, scope: string, token: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(idemKey(userId, scope, token));
  } catch {
    /* will expire via PX */
  }
}
