// src/app/api/chat/assets/route.ts
// Token-gated assets for the OBS chat overlay: real Twitch badge images +
// third-party emotes (7TV / BTTV / FFZ). The overlay fetches this once on load
// and refreshes every few minutes (assets are server-cached, so this is cheap).
import { NextResponse } from "next/server";
import { isValidOverlayToken } from "@/lib/alerts";
import { getChatAssets } from "@/lib/chat-assets";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const assets = await getChatAssets();
    return NextResponse.json(assets);
  } catch {
    // Never break the overlay — return empty maps so it falls back to text/emoji.
    return NextResponse.json({ badges: {}, emotes: {} });
  }
}
