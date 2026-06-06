// src/app/api/alerts/viewers/route.ts
// Token-gated feed for the "viewer count" OBS widget. Reads the streamer's live
// viewer count from Twitch Helix (/streams). Cached ~12s via shared Redis cache
// (Upstash) when configured — so multiple overlay polls across serverless
// instances don't each hammer Helix. Falls back to in-process cache without Redis.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken } from "@/lib/alerts";
import { getAppAccessToken, helixGet } from "@/lib/twitch";
import { cacheJson } from "@/lib/redis";

export const dynamic = "force-dynamic";

const CACHE_MS = 12_000;

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await cacheJson<Record<string, unknown>>("viewers:default", CACHE_MS, async () => {
    const streamer = await prisma.twitchStreamerToken.findUnique({ where: { id: "default" } });
    if (!streamer?.broadcasterId) {
      return { live: false, configured: false };
    }
    try {
      const appToken = await getAppAccessToken();
      const data = await helixGet<{ data: Array<{ viewer_count: number; game_name: string | null }> }>(
        `/streams?user_id=${streamer.broadcasterId}`,
        appToken,
      );
      const s = data.data[0];
      return s
        ? { live: true, configured: true, viewers: s.viewer_count, game: s.game_name ?? null }
        : { live: false, configured: true };
    } catch {
      return { live: false, configured: true, error: true };
    }
  });

  return NextResponse.json(body);
}
