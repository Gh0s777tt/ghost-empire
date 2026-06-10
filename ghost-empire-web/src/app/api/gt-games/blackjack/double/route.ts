// src/app/api/gt-games/blackjack/double/route.ts — double the bet, one card, auto-stand.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { blackjackDouble } from "@/lib/gt-blackjack";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);

  let body: { sessionId?: string };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }
  if (!body.sessionId || typeof body.sessionId !== "string") return jsonError("Brak sesji", 400);

  const rl = await rateLimit(`bj:act:${session.user.id}`, 120, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  const result = await blackjackDouble(session.user.id, body.sessionId);
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json(result);
}
