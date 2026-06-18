// src/app/api/alerts/[feed]/route.ts
// Polled fallback for OBS overlays — ONE dynamic route for every producer-backed
// feed key (goals/subathon/polls/predictions/recent-events/emoji-combo/rumble/
// wheel/widget/chat/viewers). The realtime path is the generic SSE streamer
// /api/overlay/stream/[feed]; both share the lib/overlay-feeds producer so the
// payload is identical regardless of transport. Token-gated.
//
// Note: /api/alerts/stream and /api/alerts/queue are separate STATIC routes (not
// producer-backed); Next.js prefers static segments over this dynamic one, so
// they keep working and never reach here.
import { NextResponse } from "next/server";
import { isValidOverlayToken } from "@/lib/alerts";
import { getOverlayFeed } from "@/lib/overlay-feeds";
import { currentTenantId } from "@/lib/tenant";
import { featureGateResponse } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ feed: string }> }) {
  const { feed } = await ctx.params;
  const def = getOverlayFeed(feed);
  if (!def) return NextResponse.json({ error: "Unknown feed" }, { status: 404 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const tenantId = await currentTenantId();
  if (!(await isValidOverlayToken(token, tenantId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Overlays are a pro feature — gate the polled fallback too, else the SSE gate
  // (/api/overlay/stream/[feed]) is trivially bypassed by falling back to polling.
  const gated = await featureGateResponse("overlays");
  if (gated) return gated;
  // The custom-widget feed needs an explicit id (preserves the old per-route 400).
  if (feed === "widget" && !url.searchParams.get("id")) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  return NextResponse.json(await def.producer(url.searchParams, tenantId));
}
