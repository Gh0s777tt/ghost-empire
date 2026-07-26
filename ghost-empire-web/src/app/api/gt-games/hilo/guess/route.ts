// src/app/api/gt-games/hilo/guess/route.ts — guess hi/lo; correct multiplies, wrong busts.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hiloGuess } from "@/lib/gt-hilo";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);

  let body: { sessionId?: string; guess?: string };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }
  if (!body.sessionId || typeof body.sessionId !== "string") return jsonError("Brak sesji", 400);

  const rl = await rateLimit(`hilo:act:${session.user.id}`, 120, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  const result = await hiloGuess(session.user.id, body.sessionId, body.guess === "hi" ? "hi" : body.guess === "lo" ? "lo" : ("" as never));
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json(result);
}
