// src/app/api/bot/heartbeat/route.ts
// Bot → portal liveness ping (Bearer BOT_SECRET), every ~60 s. Stores the last
// beat per tenant (resolved from the request Host, like every bot route) so
// the admin panel can show "bot online/offline" instead of guessing. Read
// side: /api/admin/bot-status.
import { NextResponse } from "next/server";
import { verifyBotSecretForTenant } from "@/lib/utils";
import { getCurrentTenantBotAuth } from "@/lib/tenant";
import { recordHeartbeat } from "@/lib/bot-heartbeat";

export const dynamic = "force-dynamic";

const KNOWN = new Set(["twitch", "kick", "youtube"]);

export async function POST(req: Request) {
  // Resolve the tenant (Host-based) once: its secret authenticates a per-tenant bot (global
  // BOT_SECRET still accepted for the first-party bot) and its id scopes the heartbeat row.
  const { id: tid, botSecret } = await getCurrentTenantBotAuth();
  if (!verifyBotSecretForTenant(req.headers.get("authorization"), botSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let platforms: string[] = [];
  try {
    const body = (await req.json()) as { platforms?: unknown };
    if (Array.isArray(body.platforms)) {
      platforms = body.platforms.filter((p): p is string => typeof p === "string" && KNOWN.has(p)).slice(0, 3);
    }
  } catch {
    /* body is optional — a bare beat still counts */
  }

  await recordHeartbeat(tid, platforms);
  return NextResponse.json({ ok: true });
}
