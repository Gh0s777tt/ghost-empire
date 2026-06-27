// src/lib/league-rewards.ts
// Prediction League month-end settlement (#682): at month rollover the top monthly typers
// (by net GT, net>0, min activity) win a small GT prize + a permanent Hall of Fame entry.
// Idempotent: the LeagueSeasonResult unique [tenantId, seasonNumber, userId] is the claim —
// a re-run throws P2002 on the first insert and the tenant is skipped (no double-pay).
// Mirrors the per-tenant payout + notify shape of the weekly-rewards cron.
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/seasons";
import { createLogger } from "@/lib/logger";

const log = createLogger("league-rewards");

// GT minted to ranks 1/2/3 — conservative, owner-chosen (#682). Tune here.
export const LEAGUE_PRIZES = [1500, 750, 300] as const;
export const MIN_PLAYS_FOR_PRIZE = 3;

/** Pure: GT prize for a 1-based rank (0 outside the prize table). Unit-tested. */
export function prizeForRank(rank: number): number {
  return LEAGUE_PRIZES[rank - 1] ?? 0;
}

/** Pure: the [start,end) bounds + number/label of the calendar month BEFORE `now`. Unit-tested. */
export function previousMonthBounds(now = new Date()): { start: Date; end: Date; number: number; label: string } {
  const firstOfThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return monthBounds(new Date(firstOfThis.getTime() - 1)); // 1 ms before this month = last ms of prev month
}

type WinnerAgg = { userId: string; net: number; wins: number; plays: number };

/** Top finishers of a CLOSED month window (net>0, min plays), ranked by net then wins. */
async function topFinishers(tenantId: string | null, start: Date, end: Date, take: number): Promise<WinnerAgg[]> {
  return prisma.$queryRaw<WinnerAgg[]>`
    SELECT pe."userId"                                                       AS "userId",
           COALESCE(SUM(pe.payout - pe."tokensWagered"), 0)::int             AS net,
           (COUNT(*) FILTER (WHERE pe.payout > pe."tokensWagered"))::int     AS wins,
           COUNT(*)::int                                                     AS plays
    FROM "prediction_entries" pe
    JOIN "predictions" p ON p.id = pe."predictionId"
    WHERE p.status = 'resolved'
      AND p."resolvedAt" >= ${start} AND p."resolvedAt" < ${end}
      AND (${tenantId}::text IS NULL OR p."tenantId" = ${tenantId})
    GROUP BY pe."userId"
    HAVING COUNT(*) >= ${MIN_PLAYS_FOR_PRIZE} AND COALESCE(SUM(pe.payout - pe."tokensWagered"), 0) > 0
    ORDER BY net DESC, wins DESC
    LIMIT ${take}
  `;
}

export type SettleResult = { tenantId: string | null; settled: boolean; winners: number; prized: number };

/** Settle ONE portal's league for a closed season. Idempotent via the result-row unique. */
export async function settleLeagueSeason(
  tenantId: string | null,
  seasonNumber: number,
  seasonLabel: string,
  start: Date,
  end: Date,
): Promise<SettleResult> {
  const top = await topFinishers(tenantId, start, end, LEAGUE_PRIZES.length);
  if (top.length === 0) return { tenantId, settled: false, winners: 0, prized: 0 };
  try {
    const prized = await prisma.$transaction(async (tx) => {
      let total = 0;
      for (let i = 0; i < top.length; i++) {
        const w = top[i];
        const rank = i + 1;
        const prize = prizeForRank(rank);
        // Insert the podium row FIRST: its unique [tenantId, seasonNumber, userId] is the
        // idempotency claim. A double cron-fire throws P2002 here → caught → tenant skipped.
        await tx.leagueSeasonResult.create({
          data: { tenantId, seasonNumber, seasonLabel, userId: w.userId, rank, net: w.net, wins: w.wins, plays: w.plays, prize },
        });
        if (prize > 0) {
          await tx.user.update({ where: { id: w.userId }, data: { tokens: { increment: prize }, totalEarned: { increment: prize } } });
          await tx.transaction.create({ data: { userId: w.userId, type: "earn", amount: prize, reason: `league-prize:${seasonNumber}`, status: "completed" } });
          total += prize;
        }
        await tx.notification.create({
          data: {
            userId: w.userId,
            type: "event_win",
            title: "👑 Liga Typerów — podium!",
            message: prize > 0
              ? `${rank}. miejsce w Lidze Typerów (${seasonLabel}) — +${prize.toLocaleString("pl-PL")} GT! Gratulacje!`
              : `${rank}. miejsce w Lidze Typerów (${seasonLabel})! Gratulacje!`,
            icon: "👑",
            link: "/leagues",
          },
        });
      }
      return total;
    });
    log.info("league settled", { tenantId, seasonNumber, winners: top.length, prized });
    return { tenantId, settled: true, winners: top.length, prized };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      return { tenantId, settled: false, winners: 0, prized: 0 }; // already settled this season
    }
    log.error("settleLeagueSeason failed", e);
    throw e;
  }
}

/** Cron entry (folded into weekly-rewards): settle the PREVIOUS month for every portal. Idempotent. */
export async function settlePreviousMonthLeagues(now = new Date()): Promise<{ seasonNumber: number; results: SettleResult[] }> {
  const { start, end, number, label } = previousMonthBounds(now);
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  const tids: (string | null)[] = [null, ...tenants.map((t) => t.id)];
  const results: SettleResult[] = [];
  for (const tid of tids) {
    try {
      results.push(await settleLeagueSeason(tid, number, label, start, end));
    } catch (e) {
      log.error(`league settle failed for tenant ${tid}`, e);
    }
  }
  return { seasonNumber: number, results };
}

export type HallOfFameSeason = {
  seasonNumber: number;
  seasonLabel: string;
  podium: Array<{ rank: number; name: string; image: string | null; prize: number; net: number }>;
};

type NameRow = { name: string | null; displayName: string | null; username: string | null };
function displayName(c: NameRow | null | undefined): string {
  return c?.displayName || c?.name || c?.username || "Widmo";
}

/** Hall of Fame: recent past podiums for a portal (most recent season first). */
export async function getHallOfFame(tenantId: string | null, limitSeasons = 6): Promise<HallOfFameSeason[]> {
  const rows = await prisma.leagueSeasonResult.findMany({
    where: { ...(tenantId ? { tenantId } : {}) },
    orderBy: [{ seasonNumber: "desc" }, { rank: "asc" }],
    take: limitSeasons * LEAGUE_PRIZES.length,
    select: {
      seasonNumber: true, seasonLabel: true, rank: true, prize: true, net: true,
      user: { select: { name: true, displayName: true, username: true, image: true } },
    },
  });
  const bySeason = new Map<number, HallOfFameSeason>();
  for (const r of rows) {
    let s = bySeason.get(r.seasonNumber);
    if (!s) { s = { seasonNumber: r.seasonNumber, seasonLabel: r.seasonLabel, podium: [] }; bySeason.set(r.seasonNumber, s); }
    s.podium.push({ rank: r.rank, name: displayName(r.user), image: r.user?.image ?? null, prize: r.prize, net: r.net });
  }
  return [...bySeason.values()];
}
