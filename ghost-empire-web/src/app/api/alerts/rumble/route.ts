// src/app/api/alerts/rumble/route.ts
// Polled fallback for the Rumble OBS overlay (live status + follower/sub counts)
// — the realtime path is the generic SSE streamer /api/overlay/stream/rumble.
// Both share the lib/overlay-feeds producer so the payload is identical
// regardless of transport. Token-gated.
import { NextResponse } from "next/server";
import { isValidOverlayToken } from "@/lib/alerts";
import { OVERLAY_FEEDS } from "@/lib/overlay-feeds";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await OVERLAY_FEEDS.rumble.producer(url.searchParams));
}
