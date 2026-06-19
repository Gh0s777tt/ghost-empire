// src/lib/twitch-clips.ts
// "Clip of the Week": the streamer's recent Twitch clips (live from Helix, cached;
// not stored) + an ISO-week key so votes reset weekly. App token + broadcaster id,
// same pattern as live-status. Empty list when no Twitch broadcaster is set up.
import { cacheJson } from "@/lib/redis";
import { getAppAccessToken, helixGet } from "@/lib/twitch";
import { getTwitchStreamerToken } from "@/lib/platform-tokens";

const CLIPS_CACHE_MS = 5 * 60_000;
const CLIPS_WINDOW_DAYS = 7;
const CLIPS_LIMIT = 12;

export type Clip = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  creator: string;
  views: number;
  createdAt: string;
};

/** ISO-8601 week key like "2026-W25" (weeks start Monday; week 1 holds the first Thursday). */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // shift to this week's Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Recent clips (last 7 days), cached. Returns [] when unconfigured or on error. */
export function getRecentClips(tid: string | null): Promise<Clip[]> {
  return cacheJson<Clip[]>(`clips:${tid ?? "default"}`, CLIPS_CACHE_MS, async () => {
    const streamer = await getTwitchStreamerToken(tid);
    if (!streamer?.broadcasterId) return [];
    try {
      const appToken = await getAppAccessToken();
      const now = Date.now();
      const startedAt = new Date(now - CLIPS_WINDOW_DAYS * 86_400_000).toISOString();
      const endedAt = new Date(now).toISOString();
      const data = await helixGet<{
        data: Array<{ id: string; title: string; url: string; thumbnail_url: string; creator_name: string; view_count: number; created_at: string }>;
      }>(
        `/clips?broadcaster_id=${streamer.broadcasterId}&started_at=${startedAt}&ended_at=${endedAt}&first=${CLIPS_LIMIT}`,
        appToken,
      );
      return (data.data ?? []).map((c) => ({
        id: c.id,
        title: c.title || "Clip",
        url: c.url,
        thumbnailUrl: c.thumbnail_url,
        creator: c.creator_name,
        views: c.view_count,
        createdAt: c.created_at,
      }));
    } catch {
      return [];
    }
  });
}
