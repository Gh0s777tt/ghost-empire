// src/lib/bot-heartbeat.ts
// Bot liveness: the chat bot POSTs /api/bot/heartbeat every minute; the admin
// panel reads the last beat to show "bot online/offline". Stored in Redis
// (shared across serverless instances) with an in-memory fallback mirroring
// lib/redis's degradation — without Redis the status is best-effort per
// instance, never an error. Keyed per tenant (everything per-portal).
import { redis } from "@/lib/redis";

/** A beat is considered "online" for this long after it lands (bot pings every ~60 s). */
export const HEARTBEAT_FRESH_MS = 3 * 60_000;
/** Redis TTL — keep a stale beat around so the admin can show "last seen 2 h ago". */
const HEARTBEAT_TTL_MS = 7 * 24 * 60 * 60_000;

export type Heartbeat = {
  at: number; // epoch ms of the last beat
  platforms: string[]; // platforms the bot instance is configured for
};

/** Pure freshness check (unit-tested): online iff the beat is younger than the window. */
export function isHeartbeatFresh(beatAt: number | null | undefined, now: number, freshMs: number = HEARTBEAT_FRESH_MS): boolean {
  return typeof beatAt === "number" && beatAt > 0 && now - beatAt < freshMs;
}

const key = (tenantId: string | null) => `bot:heartbeat:${tenantId ?? "default"}`;

// In-memory fallback (single tenant map is tiny; only used without Redis).
const mem = new Map<string, Heartbeat>();

export async function recordHeartbeat(tenantId: string | null, platforms: string[]): Promise<void> {
  const beat: Heartbeat = { at: Date.now(), platforms };
  if (redis) {
    try {
      await redis.set(key(tenantId), beat, { px: HEARTBEAT_TTL_MS });
      return;
    } catch {
      /* Redis down → remember in-process (fail-open) */
    }
  }
  mem.set(key(tenantId), beat);
}

export async function readHeartbeat(tenantId: string | null): Promise<Heartbeat | null> {
  if (redis) {
    try {
      return (await redis.get<Heartbeat>(key(tenantId))) ?? null;
    } catch {
      /* fall through to memory */
    }
  }
  return mem.get(key(tenantId)) ?? null;
}
