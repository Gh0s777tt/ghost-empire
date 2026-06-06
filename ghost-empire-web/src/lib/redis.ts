// src/lib/redis.ts
// Upstash Redis (REST) — współdzielony cache między instancjami serverless.
// Skonfigurowany przez UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (Vercel env).
// Gdy brak env → klient = null, a cacheJson() spada na cache in-memory (per-instancja),
// więc lokalnie/bez Redisa wszystko działa jak dotąd (graceful degradation).
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const hasRedis = Boolean(url && token);
export const redis = hasRedis ? new Redis({ url: url as string, token: token as string }) : null;

// Fallback in-process (działa w obrębie jednej instancji, gdy Redis nieskonfigurowany).
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
    mem.set(key, { at: Date.now(), val });
  }
  return val;
}
