// src/lib/live-status.ts
// Is the streamer live right now? (Twitch Helix). Shared by the OBS viewers
// overlay feed AND the public "LIVE now" banner on the portal home, so both
// share ONE cached Helix call per tenant instead of hammering the API.
import { cacheJson } from "@/lib/redis";
import { getAppAccessToken, helixGet } from "@/lib/twitch";
import { getTwitchStreamerToken } from "@/lib/platform-tokens";

const LIVE_CACHE_MS = 12_000;

export type LiveStatus =
  | { live: false; configured: boolean; error?: boolean }
  | { live: true; configured: true; viewers: number; game: string | null; title: string | null };

/** Cached live status for a tenant. `configured: false` = no Twitch broadcaster set up. */
export function getLiveStatus(tid: string | null): Promise<LiveStatus> {
  return cacheJson<LiveStatus>(`live:${tid ?? "default"}`, LIVE_CACHE_MS, async () => {
    const streamer = await getTwitchStreamerToken(tid);
    if (!streamer?.broadcasterId) return { live: false, configured: false };
    try {
      const appToken = await getAppAccessToken();
      const data = await helixGet<{ data: Array<{ viewer_count: number; game_name: string | null; title: string | null }> }>(
        `/streams?user_id=${streamer.broadcasterId}`,
        appToken,
      );
      const s = data.data[0];
      return s
        ? { live: true, configured: true, viewers: s.viewer_count, game: s.game_name ?? null, title: s.title ?? null }
        : { live: false, configured: true };
    } catch {
      return { live: false, configured: true, error: true };
    }
  });
}
