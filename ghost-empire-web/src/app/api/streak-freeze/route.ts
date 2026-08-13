// src/app/api/streak-freeze/route.ts
// Buy a Streak Freeze (ochrona serii) for GT — one lapse won't reset a long watch-streak. Owned
// count + auto-consumption live in lib/watch-streak (derived from transactions, no schema change);
// this route is just the atomic purchase. Status (owned/protected) is served by GET /api/watch-streak.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { buyStreakFreeze } from "@/lib/watch-streak";
import { claimIdempotent, idempotencyToken } from "@/lib/idempotency";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;

  const rl = await rateLimit(`streak-freeze:${userId}`, 10, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  // Idempotency: the buy has no distinguishing body, so a double-click would otherwise buy two →
  // the constant body-token blocks the accidental second purchase for a few seconds (409).
  if (!(await claimIdempotent(userId, "streak-freeze:buy", idempotencyToken(req, {}))).ok) {
    return jsonError("Akcja już przetwarzana — odśwież stronę.", 409);
  }

  const r = await buyStreakFreeze(userId);
  if (!r.ok) return jsonError(r.error, r.status);
  return NextResponse.json({ ok: true, freezes: r.freezes, newBalance: r.newBalance });
}
