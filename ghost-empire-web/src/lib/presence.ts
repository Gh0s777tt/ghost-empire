// src/lib/presence.ts
// Portal presence (#767) — "who is on the portal RIGHT NOW". Realtime via a Redis ZSET
// per tenant: every open tab heartbeats every ~25 s; a member counts as online for 60 s
// after its last beat. Works for signed-in users (actor "u:<id>") and guests (actor
// "a:<anon>", a client-generated id — never trusted beyond a strict shape check).
// DORMANT-SAFE: without Upstash Redis every call returns null and the UI hides itself
// (presence needs cross-instance shared state; a per-instance fallback would just lie).
// SERVER-ONLY (redis + prisma) — client components import lib/presence-shared instead.
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import {
  PRESENCE_TTL_MS,
  PRESENCE_SAMPLE,
  presenceKey,
  isUserActor,
  actorUserId,
} from "@/lib/presence-shared";

export {
  PRESENCE_TTL_MS,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_SAMPLE,
  presenceKey,
  anonActor,
  userActor,
  isUserActor,
  actorUserId,
} from "@/lib/presence-shared";

/**
 * Record a heartbeat for `actor` on this tenant. Prunes expired members in the same
 * call so the set never grows unbounded. Returns the current online count, or null
 * when presence is dormant (no Redis) / Redis errored (fail-quiet — presence is
 * decorative, it must never break a page).
 */
export async function presenceBeat(tenantId: string | null, actor: string): Promise<number | null> {
  if (!redis) return null;
  const key = presenceKey(tenantId);
  const now = Date.now();
  try {
    await redis.zadd(key, { score: now, member: actor });
    await redis.zremrangebyscore(key, 0, now - PRESENCE_TTL_MS);
    // Safety TTL: an abandoned tenant key disappears on its own.
    await redis.expire(key, Math.ceil((PRESENCE_TTL_MS * 5) / 1000));
    return (await redis.zcard(key)) ?? 0;
  } catch {
    return null;
  }
}

export type PresenceSnapshot = {
  online: number;
  /** Most-recently-active signed-in users (for an avatar row), newest first. */
  users: { username: string | null; displayName: string | null; image: string | null }[];
};

/**
 * Current presence for a tenant: total online (users + guests) and a small sample of
 * signed-in users resolved to public display fields. Null when dormant (no Redis).
 */
export async function presenceSnapshot(tenantId: string | null): Promise<PresenceSnapshot | null> {
  if (!redis) return null;
  const key = presenceKey(tenantId);
  const now = Date.now();
  try {
    await redis.zremrangebyscore(key, 0, now - PRESENCE_TTL_MS);
    const [online, recent] = await Promise.all([
      redis.zcard(key),
      redis.zrange<string[]>(key, 0, 49, { rev: true }),
    ]);
    const userIds = (recent ?? []).filter(isUserActor).map(actorUserId).slice(0, PRESENCE_SAMPLE);
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, displayName: true, image: true },
        })
      : [];
    // Preserve recency order from the ZSET (findMany does not).
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      online: online ?? 0,
      users: userIds
        .map((id) => byId.get(id))
        .filter((u): u is NonNullable<typeof u> => !!u)
        .map((u) => ({ username: u.username, displayName: u.displayName, image: u.image })),
    };
  } catch {
    return null;
  }
}
