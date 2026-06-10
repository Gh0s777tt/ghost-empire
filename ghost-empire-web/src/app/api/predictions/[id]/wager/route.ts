// src/app/api/predictions/[id]/wager/route.ts
// User wagers tokens on a prediction option.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { placeWager } from "@/lib/predictions";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { featureGateResponse } from "@/lib/entitlements";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: predictionId } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) {
    return jsonError("Musisz być zalogowany", 401);
  }
  const userId = session.user.id;
  const gated = await featureGateResponse("predictions");
  if (gated) return gated;

  // 5 wager actions per minute per user (anti-spam, anti-double-click)
  const rl = await rateLimit(`prediction:wager:${userId}`, 5, 60_000);
  if (!rl.allowed) {
    return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));
  }

  let body: { optionIndex?: number; tokensWagered?: number };
  try { body = await req.json(); } catch {
    return jsonError("Nieprawidłowe dane", 400);
  }

  if (typeof body.optionIndex !== "number" || typeof body.tokensWagered !== "number") {
    return jsonError("Wymagane: optionIndex (number) + tokensWagered (number)", 400);
  }

  const result = await placeWager({
    userId,
    predictionId,
    optionIndex: body.optionIndex,
    tokensWagered: Math.floor(body.tokensWagered),
  });

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return NextResponse.json(result);
}
