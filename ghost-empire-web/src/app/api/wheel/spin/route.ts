// src/app/api/wheel/spin/route.ts
// Authed: spend GT to spin the Wheel of Fortune. The result feeds both the
// caller (for the local spin animation) and /overlay/wheel (latest spin).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { spinWheel, WheelError } from "@/lib/wheel";
import { featureGateResponse } from "@/lib/entitlements";
import { updateDailyTaskProgress } from "@/lib/daily-tasks";
import { createLogger } from "@/lib/logger";

const log = createLogger("wheel");

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return jsonError("Musisz być zalogowany", 401);
  }
  const userId = session.user.id;
  const gated = await featureGateResponse("wheel");
  if (gated) return gated;

  // Max 20 spins/min — generous for fun, stops scripted draining/double-clicks.
  const rl = await rateLimit(`wheel:spin:${userId}`, 20, 60_000);
  if (!rl.allowed) {
    return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));
  }

  try {
    const result = await spinWheel(userId);
    await updateDailyTaskProgress(userId, "wheel_spin").catch(() => {}); // best-effort daily quest
    return NextResponse.json({
      ok: true,
      spinId: result.spinId,
      segmentIndex: result.segmentIndex,
      segmentLabel: result.segmentLabel,
      rewardTokens: result.rewardTokens,
      cost: result.cost,
      net: result.net,
      newBalance: result.newBalance,
    });
  } catch (e) {
    if (e instanceof WheelError) {
      return jsonError(e.message, e.status);
    }
    log.error("spin error", e);
    return jsonError("Błąd serwera", 500);
  }
}
