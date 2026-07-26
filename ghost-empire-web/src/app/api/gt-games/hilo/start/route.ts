// src/app/api/gt-games/hilo/start/route.ts — charge the bet, deal the first card.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { currentTenantId } from "@/lib/tenant";
import { hiloStart } from "@/lib/gt-hilo";
import { feedJackpot } from "@/lib/gt-games";
import { featureGateResponse } from "@/lib/entitlements";
import { casinoGate } from "@/lib/compliance";

export async function POST(req: Request) {
  // §7 ust. 12 zakazuje mechaniki i nazewnictwa kasynowego — patrz lib/compliance.ts.
  const blocked = casinoGate();
  if (blocked) return blocked;

  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const gated = await featureGateResponse("casino");
  if (gated) return gated;

  let body: { bet?: number };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }

  const rl = await rateLimit(`hilo:start:${session.user.id}`, 30, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  const bet = Math.floor(Number(body.bet ?? 0));
  const result = await hiloStart(session.user.id, bet);
  if (!result.ok) return jsonError(result.error, result.status);
  void feedJackpot(bet, await currentTenantId()).catch(() => {}); // 1% of every casino bet feeds THIS portal's pool
  return NextResponse.json(result);
}
