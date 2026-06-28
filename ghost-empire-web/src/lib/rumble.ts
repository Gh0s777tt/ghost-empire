// src/lib/rumble.ts
// Rumble Livestream API — live status + follower/subscriber counts. Per-tenant: each portal
// stores its own full API URL (with the embedded key) in IntegrationConfig.rumbleApiUrl
// (encrypted); the founder/legacy falls back to the RUMBLE_API_URL env var. Cached per portal
// (20 s) so overlay polls don't hammer Rumble.
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

const CACHE_MS = 20_000;
const cache = new Map<string, { at: number; data: RumbleStatus }>();

export type RumbleStatus = {
  configured: boolean;
  live: boolean;
  followers: number;
  subscribers: number;
  title: string | null;
  watching: number;
};

const EMPTY: RumbleStatus = { configured: false, live: false, followers: 0, subscribers: 0, title: null, watching: 0 };

/** Resolve a portal's Rumble API URL: per-tenant IntegrationConfig first, else the env var. */
async function resolveRumbleUrl(tenantId: string | null): Promise<string | null> {
  try {
    const cfg = tenantId
      ? await prisma.integrationConfig.findFirst({ where: { tenantId }, select: { rumbleApiUrl: true } })
      : await prisma.integrationConfig.findUnique({ where: { id: "default" }, select: { rumbleApiUrl: true } });
    const url = decryptSecret(cfg?.rumbleApiUrl);
    if (url) return url;
  } catch {
    /* DB hiccup — fall through to env */
  }
  return process.env.RUMBLE_API_URL ?? null;
}

export async function getRumbleStatus(tenantId: string | null = null): Promise<RumbleStatus> {
  const key = tenantId ?? "_default";
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  const url = await resolveRumbleUrl(tenantId);
  if (!url) return EMPTY;

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`rumble ${r.status}`);
    const d = await r.json();
    const ls = Array.isArray(d?.livestreams) ? d.livestreams[0] : null;
    const data: RumbleStatus = {
      configured: true,
      live: !!ls,
      followers: Number(d?.followers?.num_followers ?? 0),
      subscribers: Number(d?.subscribers?.num_subscribers ?? 0),
      title: ls?.title ?? null,
      watching: Number(ls?.watching_now ?? 0),
    };
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return cache.get(key)?.data ?? { ...EMPTY, configured: true };
  }
}
