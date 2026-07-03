// src/app/api/bot/heartbeat/route.ts
// Bot → portal liveness ping (Bearer BOT_SECRET), every ~60 s. Stores the last
// beat per tenant (resolved from the request Host, like every bot route) so
// the admin panel can show "bot online/offline" instead of guessing. Read
// side: /api/admin/bot-status.
import { NextResponse } from "next/server";
import { verifyBotSecret } from "@/lib/utils";
import { currentTenantId } from "@/lib/tenant";
import { recordHeartbeat } from "@/lib/bot-heartbeat";

export const dynamic = "force-dynamic";

const KNOWN = new Set(["twitch", "kick", "youtube"]);

export async function POST(req: Request) {
  if (!verifyBotSecret(req.headers.get("authorization"))) {
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

  const tid = await currentTenantId();
  await recordHeartbeat(tid, platforms);
  return NextResponse.json({ ok: true });
}
