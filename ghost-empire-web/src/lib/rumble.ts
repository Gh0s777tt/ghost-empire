// src/lib/rumble.ts
// Rumble Livestream API — live status + follower/subscriber counts. The full API
// URL (with its embedded key) lives in RUMBLE_API_URL (Vercel env). Cached in-process
// so overlay polls don't hammer Rumble.
const CACHE_MS = 20_000;
let cache: { at: number; data: RumbleStatus } | null = null;

export type RumbleStatus = {
  configured: boolean;
  live: boolean;
  followers: number;
  subscribers: number;
  title: string | null;
  watching: number;
};

const EMPTY: RumbleStatus = { configured: false, live: false, followers: 0, subscribers: 0, title: null, watching: 0 };

export async function getRumbleStatus(): Promise<RumbleStatus> {
  const url = process.env.RUMBLE_API_URL;
  if (!url) return EMPTY;
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
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
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return cache?.data ?? { ...EMPTY, configured: true };
  }
}
