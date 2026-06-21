// src/app/api/cron/weekly-rewards/route.ts
// Vercel Cron (Mondays 00:00 UTC): pays the weekly leaderboard top 3 — 1000/500/250 GT
// for the most GT EARNED in the previous 7 days. Idempotent: skips if this week's
// rewards were already paid (transaction reason "weekly-reward" since Monday 00:00).
// Vercel auto-sets Authorization: Bearer ${CRON_SECRET} on cron-triggered requests.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCachedWeeklyRanking } from "@/lib/cached";
import { createLogger } from "@/lib/logger";
import { verifyCronSecret } from "@/lib/utils";

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
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const weekKey = startOfWeekUtc().getTime();
    // Pay EACH portal its own weekly top-3 — the public ranking is per-tenant, so a
    // single GLOBAL payout (the old behaviour) rewarded only the platform-wide top 3
    // against the wrong board. The founder/legacy portal is the null tenant. #audit-v2
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    const tids: (string | null)[] = [null, ...tenants.map((t) => t.id)];

    const paid: Array<{ tenant: string | null; userId: string; place: number; reward: number }> = [];
    const skipped: (string | null)[] = [];
    for (const tid of tids) {
      // At Monday 00:00 the rolling 7-day window IS the previous week.
      const { topUsers } = await getCachedWeeklyRanking(tid);
      const winners = topUsers.slice(0, REWARDS.length);
      if (winners.length === 0) continue;
      try {
        await prisma.$transaction(async (tx) => {
          for (let i = 0; i < winners.length; i++) {
            const w = winners[i];
            const reward = REWARDS[i];
            await tx.user.update({ where: { id: w.id }, data: { tokens: { increment: reward }, totalEarned: { increment: reward } } });
            await tx.transaction.create({
              data: {
                userId: w.id, type: "earn", amount: reward, reason: REASON,
                // Deterministic per-tenant-per-week marker on the 1st reward: the unique
                // externalId makes a double cron-fire (or retry) lose with P2002 — atomic
                // idempotency PER TENANT (the old global check-then-act could double-pay).
                ...(i === 0 ? { externalId: `weekly-reward:${tid ?? "_"}:${weekKey}` } : {}),
                status: "completed",
              },
            });
            await tx.notification.create({
              data: {
                userId: w.id,
                type: "event_win",
                title: "🏆 Nagroda tygodnia!",
                message: `Zająłeś ${i + 1}. miejsce w rankingu tygodnia i zdobywasz ${reward} GT! Gratulacje!`,
                icon: "🏆",
                link: "/ranking?sort=weekly",
              },
            });
          }
        });
        winners.forEach((w, i) => paid.push({ tenant: tid, userId: w.id, place: i + 1, reward: REWARDS[i] }));
      } catch (e) {
        // P2002 on the marker = this portal already got paid this week → idempotent skip.
        if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") { skipped.push(tid); continue; }
        throw e;
      }
    }

    log.info("weekly rewards paid", { paidCount: paid.length, skippedCount: skipped.length });
    return NextResponse.json({ ok: true, paid, skipped });
  } catch (e) {
    log.error("weekly rewards failed", e);
    return NextResponse.json({ error: "weekly_rewards_failed" }, { status: 500 });
  }
}
