// src/lib/presence-shared.ts
// Client-safe half of portal presence (#767): pure constants + actor helpers, with NO
// server imports (redis/prisma) — so "use client" components (PresenceBeacon) can import
// timing without dragging pg into the browser bundle. Server logic lives in lib/presence.ts.

/** A member counts as online for this long after its last heartbeat. */
export const PRESENCE_TTL_MS = 60_000;
/** Client heartbeat cadence (PresenceBeacon) — 2 beats per TTL window. */
export const PRESENCE_HEARTBEAT_MS = 25_000;
/** How many signed-in users the snapshot lists (avatars row). */
export const PRESENCE_SAMPLE = 8;

/** ZSET key holding the tenant's online members (member=actor, score=last-beat ms). */
export function presenceKey(tenantId: string | null): string {
  return `presence:${tenantId ?? "default"}`;
}

/**
 * Normalize a client-supplied anonymous id to a safe actor, or null when malformed.
 * The id is generated client-side (crypto.randomUUID stripped to hex) — we only ever
 * accept 8–32 lowercase hex chars so a hostile client can't inject arbitrary members.
 */
export function anonActor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase();
  return /^[a-f0-9]{8,32}$/.test(id) ? `a:${id}` : null;
}

/** Actor for a signed-in user. */
export function userActor(userId: string): string {
  return `u:${userId}`;
}

/** Is this ZSET member a signed-in user (vs an anonymous guest)? */
export function isUserActor(member: string): boolean {
  return member.startsWith("u:");
}

/** Strip the actor prefix back to a user id (only call for isUserActor members). */
export function actorUserId(member: string): string {
  return member.slice(2);
}
