// src/app/api/gt-games/play/route.ts
// Logged-in viewers play a GT mini-game from the /kasyno page.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { playGtGame } from "@/lib/gt-games";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });

  let body: { game?: string; bet?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  const game = body.game === "coinflip" ? "coinflip" : body.game === "slots" ? "slots" : null;
  if (!game) return NextResponse.json({ error: "Nieznana gra" }, { status: 400 });

  const rl = await rateLimit(`gtgame:web:${session.user.id}`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Za szybko. Spróbuj za chwilę." }, { status: 429, headers: rateLimitHeaders(rl) });

  const result = await playGtGame(session.user.id, game, Math.floor(Number(body.bet ?? 0)));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
