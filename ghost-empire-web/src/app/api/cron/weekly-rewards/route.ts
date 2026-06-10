// src/app/api/cron/weekly-rewards/route.ts
// Vercel Cron (Mondays 00:00 UTC): pays the weekly leaderboard top 3 — 1000/500/250 GT
// for the most GT EARNED in the previous 7 days. Idempotent: skips if this week's
// rewards were already paid (transaction reason "weekly-reward" since Monday 00:00).
// Vercel auto-sets Authorization: Bearer ${CRON_SECRET} on cron-triggered requests.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCachedWeeklyRanking } from "@/lib/cached";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron.weekly-rewards");
const REWARDS = [1000, 500, 250];
const REASON = "weekly-reward";

/** Monday 00:00 UTC of the current week. */
function startOfWeekUtc(now = new Date()): Date {
  const day = now.getUTCDay(); // 0=Sun..6=Sat
  const sinceMonday = (day + 6) % 7;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Idempotency: one payout per week, even if the cron fires twice.
    const already = await prisma.transaction.findFirst({
      where: { reason: REASON, createdAt: { gte: startOfWeekUtc() } },
      select: { id: true },
    });
    if (already) return NextResponse.json({ ok: true, skipped: "already-paid-this-week" });

    // At Monday 00:00 the rolling 7-day window IS the previous week.
    const { topUsers } = await getCachedWeeklyRanking(null);
    const winners = topUsers.slice(0, REWARDS.length);
    if (winners.length === 0) return NextResponse.json({ ok: true, skipped: "no-winners" });

    const paid: Array<{ userId: string; place: number; reward: number }> = [];
    for (let i = 0; i < winners.length; i++) {
      const w = winners[i];
      const reward = REWARDS[i];
      await prisma.$transaction([
        prisma.user.update({ where: { id: w.id }, data: { tokens: { increment: reward }, totalEarned: { increment: reward } } }),
        prisma.transaction.create({ data: { userId: w.id, type: "earn", amount: reward, reason: REASON, status: "completed" } }),
        prisma.notification.create({
          data: {
            userId: w.id,
            type: "event_win",
            title: "🏆 Nagroda tygodnia!",
            message: `Zająłeś ${i + 1}. miejsce w rankingu tygodnia i zdobywasz ${reward} GT! Gratulacje!`,
            icon: "🏆",
            link: "/ranking?sort=weekly",
          },
        }),
      ]);
      paid.push({ userId: w.id, place: i + 1, reward });
    }

    log.info("weekly rewards paid", { paid });
    return NextResponse.json({ ok: true, paid });
  } catch (e) {
    log.error("weekly rewards failed", e);
    return NextResponse.json({ error: "weekly_rewards_failed" }, { status: 500 });
  }
}
