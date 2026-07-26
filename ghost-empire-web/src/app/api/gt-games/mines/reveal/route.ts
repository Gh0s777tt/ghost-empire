// src/app/api/gt-games/mines/reveal/route.ts
// Reveal one tile in an active Mines session. A bomb ends the game; a safe tile raises the multiplier.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { minesReveal } from "@/lib/gt-mines";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);

  let body: { sessionId?: string; tile?: number };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }

  const rl = await rateLimit(`mines:reveal:${session.user.id}`, 120, 60_000); // a player clicks many tiles
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  const result = await minesReveal(session.user.id, String(body.sessionId ?? ""), Math.floor(Number(body.tile ?? -1)));
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json(result);
}
