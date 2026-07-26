// src/app/api/gt-games/jackpot/route.ts
// Public read of the progressive jackpot pool (seed + Redis surplus) for the casino UI.
import { NextResponse } from "next/server";
import { jackpotPool } from "@/lib/gt-games";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { extractIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // The casino UI polls this during play, so the per-IP cap is generous — high
  // enough for an active player, low enough to stop an unauthenticated flood.
  const ip = extractIp(req) ?? "unknown";
  const rl = await rateLimit(`jackpot:ip:${ip}`, 120, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Za dużo zapytań" }, { status: 429, headers: rateLimitHeaders(rl) });

  // Per-portal pool — a viewer must see THIS portal's jackpot, not a shared one.
  return NextResponse.json({ pool: await jackpotPool(await currentTenantId()) });
}
