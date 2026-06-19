// src/app/api/sound-rewards/route.ts
// GT sound redemptions (viewer side). GET = the active catalog + my balance.
// POST = redeem a sound: spend GT atomically, then dispatch a "sound_redeem"
// alert whose meta carries the soundUrl so the OBS alerts overlay plays it.
// Tenant-scoped. The atomic spend mirrors shop/buy.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { displayNick } from "@/lib/utils";

const log = createLogger("sound-rewards");

export const dynamic = "force-dynamic";

class RedeemError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const tid = await currentTenantId();
  const [rewards, user] = await Promise.all([
    prisma.soundReward.findMany({
      where: { active: true, ...(tid ? { tenantId: tid } : {}) },
      orderBy: [{ sortOrder: "asc" }, { cost: "asc" }],
      select: { id: true, name: true, emoji: true, cost: true, soundUrl: true },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { tokens: true } }),
  ]);
  return NextResponse.json({ rewards, balance: user?.tokens ?? 0 });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;

  const rl = await rateLimit(`sound:${userId}`, 10, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  let body: { rewardId?: string };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }
  const rewardId = String(body.rewardId ?? "");
  if (!rewardId) return jsonError("Brak rewardId", 400);

  const tid = await currentTenantId();
  const actor = displayNick(session.user.name, session.user.username);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const reward = await tx.soundReward.findFirst({ where: { id: rewardId, active: true, ...(tid ? { tenantId: tid } : {}) } });
      if (!reward) throw new RedeemError("Dźwięk nie istnieje", 404);

      const dec = await tx.user.updateMany({
        where: { id: userId, tokens: { gte: reward.cost } },
        data: { tokens: { decrement: reward.cost }, totalSpent: { increment: reward.cost } },
      });
      if (dec.count === 0) throw new RedeemError("Za mało Ghost Tokens", 402);

      await tx.transaction.create({ data: { userId, type: "spend", amount: -reward.cost, reason: "sound_redeem", status: "completed" } });

      // Direct alert (bypasses the enabledTypes gate): the overlay plays meta.soundUrl.
      await tx.streamAlert.create({
        data: {
          ...(tid ? { tenantId: tid } : {}),
          type: "sound_redeem",
          title: reward.name,
          message: `${actor} odpalił dźwięk`,
          icon: reward.emoji ?? "🔊",
          actorName: actor,
          amount: reward.cost,
          amountLabel: "GT",
          meta: JSON.stringify({ soundUrl: reward.soundUrl }),
        },
      });

      const fresh = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true } });
      return { balance: fresh?.tokens ?? 0 };
    });
    return NextResponse.json({ ok: true, newBalance: result.balance });
  } catch (e) {
    if (e instanceof RedeemError) return jsonError(e.message, e.status);
    log.error("redeem error", e);
    return jsonError("Błąd serwera", 500);
  }
}
