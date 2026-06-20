// src/app/api/gt-games/mines/start/route.ts
// Open a Mines session: charges the bet and returns a sessionId (bomb layout stays server-side).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { minesStart } from "@/lib/gt-mines";
import { feedJackpot } from "@/lib/gt-games";
import { featureGateResponse } from "@/lib/entitlements";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const gated = await featureGateResponse("casino");
  if (gated) return gated;

  let body: { bet?: number; bombs?: number };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }

  const rl = await rateLimit(`mines:start:${session.user.id}`, 30, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  const result = await minesStart(session.user.id, Math.floor(Number(body.bet ?? 0)), Math.floor(Number(body.bombs ?? 3)));
  if (!result.ok) return jsonError(result.error, result.status);
  void feedJackpot(Math.floor(Number(body.bet ?? 0))).catch(() => {}); // 1% of every casino bet feeds the pool
  return NextResponse.json(result);
}
