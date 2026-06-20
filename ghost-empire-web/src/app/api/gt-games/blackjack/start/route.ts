// src/app/api/gt-games/blackjack/start/route.ts
// Deal a blackjack hand: charges the bet, returns the session (naturals settle instantly).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { blackjackStart } from "@/lib/gt-blackjack";
import { feedJackpot } from "@/lib/gt-games";
import { featureGateResponse } from "@/lib/entitlements";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const gated = await featureGateResponse("casino");
  if (gated) return gated;

  let body: { bet?: number };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }

  const rl = await rateLimit(`bj:start:${session.user.id}`, 30, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  const bet = Math.floor(Number(body.bet ?? 0));
  const result = await blackjackStart(session.user.id, bet);
  if (!result.ok) return jsonError(result.error, result.status);
  void feedJackpot(bet).catch(() => {}); // 1% of every casino bet feeds the pool
  return NextResponse.json(result);
}
