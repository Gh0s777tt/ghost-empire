// src/app/api/bounties/pledge/route.ts
// Public — pledge GT to an open bounty (#679). Escrows the amount via lib/bounties.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { pledgeToBounty } from "@/lib/bounties";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;

  // 10 pledges per minute per user (anti-double-click; pledges are additive).
  const rl = await rateLimit(`bounty:pledge:${userId}`, 10, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  let body: { bountyId?: string; amount?: number };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }
  if (typeof body.bountyId !== "string" || typeof body.amount !== "number") {
    return jsonError("Wymagane: bountyId (string) + amount (number)", 400);
  }

  const result = await pledgeToBounty({ userId, bountyId: body.bountyId, amount: Math.floor(body.amount) });
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json(result);
}
