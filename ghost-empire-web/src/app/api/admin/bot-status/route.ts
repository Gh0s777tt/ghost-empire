// src/app/api/admin/bot-status/route.ts
// GET — bot liveness for the admin panel (per tenant): online iff the bot's
// last /api/bot/heartbeat beat is fresh. Same gate as bot-config (the badge
// renders inside that section).
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
import { readHeartbeat, isHeartbeatFresh } from "@/lib/bot-heartbeat";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("manage_shop");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const beat = await readHeartbeat(tid);
  return NextResponse.json({
    online: isHeartbeatFresh(beat?.at, Date.now()),
    lastSeenAt: beat ? new Date(beat.at).toISOString() : null,
    platforms: beat?.platforms ?? [],
  });
}
