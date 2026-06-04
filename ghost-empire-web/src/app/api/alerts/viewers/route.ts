// src/app/api/alerts/viewers/route.ts
// Token-gated feed for the "viewer count" OBS widget. Reads the streamer's live
// viewer count from Twitch Helix (/streams). Cached ~12s in-process so multiple
// overlay polls don't hammer Helix.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken } from "@/lib/alerts";
import { getAppAccessToken, helixGet } from "@/lib/twitch";

export const dynamic = "force-dynamic";

const CACHE_MS = 12_000;
let cache: { at: number; body: Record<string, unknown> } | null = null;

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.body);
  }

  const streamer = await prisma.twitchStreamerToken.findUnique({ where: { id: "default" } });
  if (!streamer?.broadcasterId) {
    const body = { live: false, configured: false };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  }

  let body: Record<string, unknown>;
  try {
    const appToken = await getAppAccessToken();
    const data = await helixGet<{ data: Array<{ viewer_count: number; game_name: string | null }> }>(
      `/streams?user_id=${streamer.broadcasterId}`,
      appToken,
    );
    const s = data.data[0];
    body = s
      ? { live: true, configured: true, viewers: s.viewer_count, game: s.game_name ?? null }
      : { live: false, configured: true };
  } catch {
    body = { live: false, configured: true, error: true };
  }

  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
