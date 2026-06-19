// src/app/api/live-status/route.ts
// Public, cached "is the streamer live?" for the portal home banner. Returns the
// Twitch live status (viewers/game) + a watch URL. Per-IP rate-limited; the Helix
// call itself is shared/cached via lib/live-status (12s), so this is cheap to poll.
import { NextResponse } from "next/server";
import { currentTenantId, getCurrentTenant } from "@/lib/tenant";
import { getLiveStatus } from "@/lib/live-status";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { extractIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = extractIp(req) ?? "unknown";
  const rl = await rateLimit(`live:ip:${ip}`, 60, 60_000);
  if (!rl.allowed) return NextResponse.json({ live: false }, { status: 429, headers: rateLimitHeaders(rl) });

  const tid = await currentTenantId();
  const [status, tenant] = await Promise.all([getLiveStatus(tid), getCurrentTenant()]);
  const watchUrl = tenant.ownerHandle ? `https://twitch.tv/${tenant.ownerHandle}` : null;
  return NextResponse.json({ ...status, watchUrl });
}
