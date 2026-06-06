// src/app/api/wheel/spin/route.ts
// Authed: spend GT to spin the Wheel of Fortune. The result feeds both the
// caller (for the local spin animation) and /overlay/wheel (latest spin).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { spinWheel, WheelError } from "@/lib/wheel";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }
  const userId = session.user.id;

  // Max 20 spins/min — generous for fun, stops scripted draining/double-clicks.
  const rl = await rateLimit(`wheel:spin:${userId}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za szybko. Spróbuj za chwilę." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  try {
    const result = await spinWheel(userId);
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
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("wheel/spin error:", e);
    return NextResponse.json({ error: "Błąd serwera" }, { status: 500 });
  }
}
