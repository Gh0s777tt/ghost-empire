// src/app/api/seasons/claim/route.ts
// User claims a season tier reward they've unlocked.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { claimSeasonReward } from "@/lib/seasons";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await rateLimit(`season:claim:${userId}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Za szybko. Spróbuj za chwilę." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: { rewardId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  if (!body.rewardId) {
    return NextResponse.json({ error: "Brak rewardId" }, { status: 400 });
  }

  const result = await claimSeasonReward(userId, body.rewardId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
