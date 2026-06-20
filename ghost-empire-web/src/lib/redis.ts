// src/lib/redis.ts
// Upstash Redis (REST) — współdzielony cache między instancjami serverless.
// Skonfigurowany przez UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (Vercel env).
// Gdy brak env → klient = null, a cacheJson() spada na cache in-memory (per-instancja),
// więc lokalnie/bez Redisa wszystko działa jak dotąd (graceful degradation).
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const hasRedis = Boolean(url && token);
export const redis = hasRedis ? new Redis({ url: url as string, token: token as string }) : null;

// Fallback in-process (działa w obrębie jednej instancji, gdy Redis nieskonfigurowany).
// Capped (FIFO, insertion-ordered Map) so the no-Redis path can't grow unbounded with
// distinct keys (e.g. per-query overlay/search keys) — TTL alone never evicted. #audit-v2
const MEM_MAX = 1000;
const mem = new Map<string, { at: number; val: unknown }>();

/**
 * Read-through cache. Zwraca zcache'owaną wartość albo woła `producer()` i zapisuje wynik.
 * Z Redisem cache jest WSPÓŁDZIELONY między instancjami (np. 1 strzał do Helix / TTL globalnie,
 * a nie raz na instancję). Bez Redisa — cache in-memory per instancja.
 *
 * @param key   stabilny klucz (np. "viewers:default")
 * @param ttlMs czas życia wpisu w ms
 * @param producer funkcja licząca świeżą wartość przy chybieniu
 */
export async function cacheJson<T>(key: string, ttlMs: number, producer: () => Promise<T>): Promise<T> {
  if (redis) {
    try {
      const hit = await redis.get<T>(key);
      if (hit !== null && hit !== undefined) return hit;
    } catch {
      /* Redis padł → policz świeżo (fail-open) */
    }
  } else {
    const m = mem.get(key);
    if (m && Date.now() - m.at < ttlMs) return m.val as T;
  }

  const val = await producer();

  if (redis) {
    try {
      await redis.set(key, val, { px: ttlMs });
    } catch {
      /* zapis do Redisa nieudany — trudno, zwróć wartość */
    }
  } else {
    if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value as string); // evict oldest
    mem.set(key, { at: Date.now(), val });
  }
  return val;
}

/**
 * Invaliduje wpis cache (oba backendy). Wołaj po mutacji, gdy stała wartość
 * musi natychmiast zniknąć z cache (np. rotacja tokenu overlay) — bez czekania
 * na TTL. Best-effort: błąd Redisa jest połykany (cache i tak wygaśnie po TTL).
 */
export async function cacheDelete(key: string): Promise<void> {
  if (redis) {
    try {
      await redis.del(key);
    } catch {
      /* del nieudany — wpis wygaśnie po TTL */
    }
  } else {
    mem.delete(key);
  }
}

// Atomic compare-and-delete: only release the lock if WE still hold it (token match),
// so a lock that already expired and was re-taken by someone else is never freed by us.
const UNLOCK_LUA = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/**
 * Best-effort single-instance lock (Redis `SET NX PX` + CAS release). Serializes a
 * critical section keyed by `key` — e.g. the read-modify-write on a stateful casino
 * session, where two concurrent reveals could otherwise erase a loss. Returns
 * `{ ok: true, value }` when the lock was held for the whole call, or `{ ok: false }`
 * when it couldn't be acquired (caller surfaces a "busy, retry" response). The lock
 * auto-expires after `ttlMs` so a crashed holder never deadlocks.
 *
 * Without Redis, or on a transient Redis error, it runs `fn` UNGUARDED (fail-open):
 * callers that need this already require Redis to be configured, and the underlying
 * `GETDEL` claims still protect the actual payout — the lock only closes the
 * intermediate read-modify-write race.
 */
export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  if (!redis) return { ok: true, value: await fn() };
  const token = randomUUID();
  let acquired = false;
  try {
    acquired = (await redis.set(key, token, { nx: true, px: ttlMs })) === "OK";
  } catch {
    return { ok: true, value: await fn() }; // lock store blip → fail open
  }
  if (!acquired) return { ok: false };
  try {
    return { ok: true, value: await fn() };
  } finally {
    try {
      await redis.eval(UNLOCK_LUA, [key], [token]);
    } catch {
      /* lock will expire via PX */
    }
  }
}
