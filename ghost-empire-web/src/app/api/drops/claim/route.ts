// src/app/api/drops/claim/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { today } from "@/lib/utils";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { dispatchAlertSafe } from "@/lib/alerts";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { awardSeasonXp } from "@/lib/seasons";
import { createLogger } from "@/lib/logger";

const log = createLogger("drops");

const CODE_REGEX = /^[A-Z0-9_-]{3,24}$/;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return jsonError("Musisz być zalogowany", 401);
  }

  let body: { code?: string };
  try { body = await req.json(); } catch {
    return jsonError("Nieprawidłowe dane", 400);
  }

  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) return jsonError("Brak kodu", 400);
  if (!CODE_REGEX.test(code)) {
    return jsonError("Kod: 3-24 znaków A-Z, 0-9, _, -", 400);
  }

  const userId = session.user.id;

  // Anti-brute-force: max 30 attempts per minute per user (trying random codes)
  const rl = await rateLimit(`drop:claim:${userId}`, 30, 60_000);
  if (!rl.allowed) {
    return jsonError("Za dużo prób. Poczekaj chwilę.", 429, rateLimitHeaders(rl));
  }

  const tid = await currentTenantId();
  const drop = await prisma.streamDrop.findFirst({ where: { code, ...(tid ? { tenantId: tid } : {}) } });
  if (!drop) return jsonError("Kod nie istnieje", 404);
  if (!drop.active) return jsonError("Kod nieaktywny", 410);
  if (drop.expiresAt && drop.expiresAt < new Date()) {
    return jsonError("Kod wygasł", 410);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Reserve the claim FIRST — the unique (dropId, userId) throws P2002 on a repeat,
      // rolling the whole tx back before we touch the counter. reward is backfilled below.
      const claim = await tx.dropClaim.create({ data: { dropId: drop.id, userId, reward: 0 } });

      // Atomic ordinal (#audit-M4): the row-locked increment serializes concurrent
      // claimers, so exactly the first `bonusSlots` get an ordinal within range. The old
      // out-of-tx count() let N racers all read 0 and all grab the bonus reward.
      const { claimCount } = await tx.streamDrop.update({
        where: { id: drop.id },
        data: { claimCount: { increment: 1 } },
        select: { claimCount: true },
      });
      const getsBonus = drop.bonusReward > 0 && claimCount <= drop.bonusSlots;
      const totalReward = drop.reward + (getsBonus ? drop.bonusReward : 0);
      await tx.dropClaim.update({ where: { id: claim.id }, data: { reward: totalReward } });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          tokens: { increment: totalReward },
          totalEarned: { increment: totalReward },
        },
        select: { tokens: true, username: true, displayName: true, image: true },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "earn",
          amount: totalReward,
          reason: `drop:${drop.code}${getsBonus ? "_bonus" : ""}`,
          status: "completed",
        },
      });

      // Daily quest progress: drop_code (per-tenant — only this portal's quests)
      const dropTasks = await tx.dailyTask.findMany({
        where: { triggerType: "drop_code", active: true, ...(tid ? { tenantId: tid } : {}) },
      });
      for (const task of dropTasks) {
        await tx.userTask.upsert({
          where: {
            userId_taskId_date: { userId, taskId: task.id, date: today() },
          },
          create: { userId, taskId: task.id, date: today(), progress: 1 },
          update: { progress: { increment: 1 } },
        });
      }

      await tx.notification.create({
        data: {
          userId,
          type: "task_reward",
          title: getsBonus ? "Drop claimed (BONUS)!" : "Drop claimed!",
          message: getsBonus
            ? `Pierwsi ${drop.bonusSlots} łapie bonus! +${totalReward} GT za kod ${drop.code}.`
            : `+${totalReward} GT za kod ${drop.code}.`,
          icon: getsBonus ? "🌟" : "🎁",
          link: "/profile",
        },
      });

      return {
        ok: true,
        code: drop.code,
        reward: drop.reward,
        bonusReward: getsBonus ? drop.bonusReward : 0,
        totalReward,
        gotBonus: getsBonus,
        bonusSlotsLeft: Math.max(0, drop.bonusSlots - claimCount),
        newBalance: updatedUser.tokens,
        _actor: {
          name: updatedUser.displayName || updatedUser.username || "Anon",
          image: updatedUser.image ?? null,
        },
      };
    });

    // Stream alert only for bonus claims (first N grabbers) — non-bonus claims would spam
    if (result.gotBonus) {
      await dispatchAlertSafe({
        type: "drop_claim_bonus",
        title: "🌟 Bonus drop złapany!",
        message: `złapał bonusowy kod ${drop.code}`,
        icon: "🌟",
        actorName: result._actor.name,
        actorImage: result._actor.image ?? undefined,
        amount: result.totalReward,
        amountLabel: "GT",
      });
    }

    // Achievement check — drops claimed milestones + season XP
    await checkAndGrantAchievements({ userId, triggerType: "drops_claimed" });
    await awardSeasonXp(userId, "drop_claim");

    const { _actor, ...publicResult } = result;
    void _actor;
    return NextResponse.json(publicResult);
  } catch (e: unknown) {
    if (
      typeof e === "object" && e !== null && "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return jsonError("Już odebrałeś ten kod", 409);
    }
    log.error("claim error", e);
    return jsonError("Błąd serwera", 500);
  }
}
