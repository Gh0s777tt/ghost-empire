// src/app/api/drops/claim/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { today } from "@/lib/utils";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { dispatchAlertSafe } from "@/lib/alerts";
import { checkAndGrantAchievements } from "@/lib/achievements";

const CODE_REGEX = /^[A-Z0-9_-]{3,24}$/;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  let body: { code?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Brak kodu" }, { status: 400 });
  if (!CODE_REGEX.test(code)) {
    return NextResponse.json(
      { error: "Kod: 3-24 znaków A-Z, 0-9, _, -" },
      { status: 400 },
    );
  }

  const userId = session.user.id;

  // Anti-brute-force: max 30 attempts per minute per user (trying random codes)
  const rl = await rateLimit(`drop:claim:${userId}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Za dużo prób. Poczekaj chwilę." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const drop = await prisma.streamDrop.findUnique({ where: { code } });
  if (!drop) return NextResponse.json({ error: "Kod nie istnieje" }, { status: 404 });
  if (!drop.active) return NextResponse.json({ error: "Kod nieaktywny" }, { status: 410 });
  if (drop.expiresAt && drop.expiresAt < new Date()) {
    return NextResponse.json({ error: "Kod wygasł" }, { status: 410 });
  }

  // Determine reward: first `bonusSlots` claimers get reward + bonusReward.
  // Race window is acceptable for streaming use case (low concurrency, no money loss).
  const existingClaims = await prisma.dropClaim.count({ where: { dropId: drop.id } });
  const getsBonus = drop.bonusReward > 0 && existingClaims < drop.bonusSlots;
  const totalReward = drop.reward + (getsBonus ? drop.bonusReward : 0);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Unique (dropId, userId) — throws P2002 if user already claimed
      await tx.dropClaim.create({
        data: { dropId: drop.id, userId, reward: totalReward },
      });

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

      // Daily quest progress: drop_code
      const dropTasks = await tx.dailyTask.findMany({
        where: { triggerType: "drop_code", active: true },
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
        bonusSlotsLeft: Math.max(0, drop.bonusSlots - existingClaims - 1),
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

    // Achievement check — drops claimed milestones
    await checkAndGrantAchievements({ userId, triggerType: "drops_claimed" });

    const { _actor, ...publicResult } = result;
    void _actor;
    return NextResponse.json(publicResult);
  } catch (e: unknown) {
    if (
      typeof e === "object" && e !== null && "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Już odebrałeś ten kod" },
        { status: 409 },
      );
    }
    console.error("drops/claim error:", e);
    return NextResponse.json({ error: "Błąd serwera" }, { status: 500 });
  }
}
