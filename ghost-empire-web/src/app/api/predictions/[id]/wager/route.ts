// src/app/api/predictions/[id]/wager/route.ts
// User wagers tokens on a prediction option.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { placeWager } from "@/lib/predictions";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: predictionId } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }
  const userId = session.user.id;

  // 5 wager actions per minute per user (anti-spam, anti-double-click)
  const rl = await rateLimit(`prediction:wager:${userId}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Za szybko. Spróbuj za chwilę." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: { optionIndex?: number; tokensWagered?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  if (typeof body.optionIndex !== "number" || typeof body.tokensWagered !== "number") {
    return NextResponse.json({ error: "Wymagane: optionIndex (number) + tokensWagered (number)" }, { status: 400 });
  }

  const result = await placeWager({
    userId,
    predictionId,
    optionIndex: body.optionIndex,
    tokensWagered: Math.floor(body.tokensWagered),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
