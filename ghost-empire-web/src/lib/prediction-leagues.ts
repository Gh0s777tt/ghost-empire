// src/lib/prediction-leagues.ts
// Prediction Leagues / "Liga Typerów" (#680): a seasonal leaderboard of the best predictors
// + a personal "Wrapped" card. Pure aggregation over EXISTING resolved prediction entries —
// NO new table, NO db push. The window is the current month (mirrors seasons.monthBounds).
// A winning entry = payout > tokensWagered (losers get payout 0; cancelled predictions are
// excluded by the status='resolved' filter). Heavy aggregates run as parameterized $queryRaw
// with COUNT(*) FILTER / SUM — the public leaderboard is cached (unstable_cache, 60s).
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/seasons";

export type LeagueRow = {
  userId: string;
  plays: number;
  wins: number;
  net: number; // sum(payout - tokensWagered) — can be negative
  wagered: number;
  biggestWin: number; // max(payout - tokensWagered) among winning entries, else 0
};

export type LeagueEntry = LeagueRow & { rank: number; winRate: number; name: string; image: string | null };

export type MyLeagueStats = LeagueRow & { rank: number; winRate: number };

/** Pure: rank already-aggregated rows by net (tie-break wins, then wagered) + attach winRate.
 *  Deterministic ordering regardless of SQL output order — unit-tested. */
export function rankRows<T extends LeagueRow>(rows: T[]): Array<T & { rank: number; winRate: number }> {
  return [...rows]
    .sort((a, b) => b.net - a.net || b.wins - a.wins || b.wagered - a.wagered || a.userId.localeCompare(b.userId))
    .map((r, i) => ({ ...r, rank: i + 1, winRate: r.plays > 0 ? r.wins / r.plays : 0 }));
}

type CreatorRow = { name: string | null; displayName: string | null; username: string | null };
function displayName(c: CreatorRow | null | undefined): string {
  return c?.displayName || c?.name || c?.username || "Widmo";
}

type RawAgg = { userId: string; plays: number; wins: number; net: number; wagered: number; biggestwin: number };

/** Top-N predictors this month for a portal. Cached 60s (scalar-only payload → cache-safe). */
export function getPredictionLeague(tenantId: string | null, take = 50) {
  return unstable_cache(
    async (): Promise<{ season: { number: number; label: string }; rows: LeagueEntry[] }> => {
      const { start, number, label } = monthBounds();
      const raw = await prisma.$queryRaw<RawAgg[]>`
        SELECT pe."userId"                                                                    AS "userId",
               COUNT(*)::int                                                                  AS plays,
               (COUNT(*) FILTER (WHERE pe.payout > pe."tokensWagered"))::int                  AS wins,
               COALESCE(SUM(pe.payout - pe."tokensWagered"), 0)::int                          AS net,
               COALESCE(SUM(pe."tokensWagered"), 0)::int                                      AS wagered,
               COALESCE(MAX(pe.payout - pe."tokensWagered")
                        FILTER (WHERE pe.payout > pe."tokensWagered"), 0)::int                AS biggestwin
        FROM "prediction_entries" pe
        JOIN "predictions" p ON p.id = pe."predictionId"
        WHERE p.status = 'resolved'
          AND p."resolvedAt" >= ${start}
          AND (${tenantId}::text IS NULL OR p."tenantId" = ${tenantId})
        GROUP BY pe."userId"
        ORDER BY net DESC, plays DESC
        LIMIT ${take}
      `;
      const rows: LeagueRow[] = raw.map((r) => ({
        userId: r.userId, plays: r.plays, wins: r.wins, net: r.net, wagered: r.wagered, biggestWin: r.biggestwin,
      }));
      const ranked = rankRows(rows);
      const users = ranked.length
        ? await prisma.user.findMany({
            where: { id: { in: ranked.map((r) => r.userId) } },
            select: { id: true, name: true, displayName: true, username: true, image: true },
          })
        : [];
      const byId = new Map(users.map((u) => [u.id, u]));
      return {
        season: { number, label },
        rows: ranked.map((r) => ({ ...r, name: displayName(byId.get(r.userId)), image: byId.get(r.userId)?.image ?? null })),
      };
    },
    ["prediction-league", tenantId ?? "all", String(take)],
    { revalidate: 60, tags: ["prediction-league"] },
  )();
}

/** The caller's own season stats + exact rank (null if they made no resolved bets this month).
 *  Personalized → NOT cached. */
export async function getMyLeagueStats(userId: string, tenantId: string | null): Promise<MyLeagueStats | null> {
  const { start } = monthBounds();
  const mine = await prisma.$queryRaw<RawAgg[]>`
    SELECT ${userId}                                                                      AS "userId",
           COUNT(*)::int                                                                  AS plays,
           (COUNT(*) FILTER (WHERE pe.payout > pe."tokensWagered"))::int                  AS wins,
           COALESCE(SUM(pe.payout - pe."tokensWagered"), 0)::int                          AS net,
           COALESCE(SUM(pe."tokensWagered"), 0)::int                                      AS wagered,
           COALESCE(MAX(pe.payout - pe."tokensWagered")
                    FILTER (WHERE pe.payout > pe."tokensWagered"), 0)::int                AS biggestwin
    FROM "prediction_entries" pe
    JOIN "predictions" p ON p.id = pe."predictionId"
    WHERE p.status = 'resolved'
      AND p."resolvedAt" >= ${start}
      AND (${tenantId}::text IS NULL OR p."tenantId" = ${tenantId})
      AND pe."userId" = ${userId}
  `;
  const row = mine[0];
  if (!row || row.plays === 0) return null;

  const rankRes = await prisma.$queryRaw<{ rank: number }[]>`
    SELECT (COUNT(*) + 1)::int AS rank FROM (
      SELECT pe."userId", SUM(pe.payout - pe."tokensWagered") AS net
      FROM "prediction_entries" pe
      JOIN "predictions" p ON p.id = pe."predictionId"
      WHERE p.status = 'resolved'
        AND p."resolvedAt" >= ${start}
        AND (${tenantId}::text IS NULL OR p."tenantId" = ${tenantId})
      GROUP BY pe."userId"
      HAVING SUM(pe.payout - pe."tokensWagered") > ${row.net}
    ) s
  `;
  return {
    userId, plays: row.plays, wins: row.wins, net: row.net, wagered: row.wagered, biggestWin: row.biggestwin,
    winRate: row.plays > 0 ? row.wins / row.plays : 0,
    rank: rankRes[0]?.rank ?? 1,
  };
}
