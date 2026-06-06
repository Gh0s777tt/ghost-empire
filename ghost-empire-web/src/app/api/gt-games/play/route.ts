// src/app/api/gt-games/play/route.ts
// Logged-in viewers play a GT mini-game from the /kasyno page.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { playGtGame } from "@/lib/gt-games";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);

  let body: { game?: string; bet?: number; choice?: string };
  try { body = await req.json(); } catch {
    return jsonError("Nieprawidłowe dane", 400);
  }
  const game =
    body.game === "coinflip" ? "coinflip" :
    body.game === "slots" ? "slots" :
    body.game === "roulette" ? "roulette" : null;
  if (!game) return jsonError("Nieznana gra", 400);

  const rl = await rateLimit(`gtgame:web:${session.user.id}`, 30, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  const choice = typeof body.choice === "string" ? body.choice : undefined;
  const result = await playGtGame(session.user.id, game, Math.floor(Number(body.bet ?? 0)), choice);
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json(result);
}
