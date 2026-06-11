// src/app/api/alerts/viewers/route.ts
// Polled fallback for the "viewer count" OBS widget — the realtime path is the
// generic SSE streamer /api/overlay/stream/viewers. Both share the
// lib/overlay-feeds producer, which reads Twitch Helix behind a shared ~12s Redis
// cache (Upstash) so overlay polls across instances don't each hammer Helix.
// Token-gated.
import { NextResponse } from "next/server";
import { isValidOverlayToken } from "@/lib/alerts";
import { OVERLAY_FEEDS } from "@/lib/overlay-feeds";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const tenantId = await currentTenantId();
  if (!(await isValidOverlayToken(token, tenantId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await OVERLAY_FEEDS.viewers.producer(url.searchParams, tenantId));
}
