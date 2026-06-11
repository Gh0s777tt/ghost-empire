// src/app/api/alerts/emoji-combo/route.ts
// Polled fallback for the emoji-combo OBS overlay — the realtime path is the
// generic SSE streamer /api/overlay/stream/emoji-combo. Both share the
// lib/overlay-feeds producer (which returns the combo only while it's fresh) so
// the payload is identical regardless of transport. Token-gated.
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
  return NextResponse.json(await OVERLAY_FEEDS["emoji-combo"].producer(url.searchParams, tenantId));
}
