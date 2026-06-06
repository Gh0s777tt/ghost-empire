// src/app/api/seasons/claim/route.ts
// User claims a season tier reward they've unlocked.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { claimSeasonReward } from "@/lib/seasons";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return jsonError("Musisz być zalogowany", 401);
  }
  const userId = session.user.id;

  const rl = await rateLimit(`season:claim:${userId}`, 20, 60_000);
  if (!rl.allowed) {
    return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));
  }

  let body: { rewardId?: string };
  try { body = await req.json(); } catch {
    return jsonError("Nieprawidłowe dane", 400);
  }
  if (!body.rewardId) {
    return jsonError("Brak rewardId", 400);
  }

  const result = await claimSeasonReward(userId, body.rewardId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return NextResponse.json(result);
}
