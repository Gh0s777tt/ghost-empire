// src/lib/wrapped.ts
// Season "Wrapped" (#684): a personal monthly recap spanning the Prediction League,
// Viewer Bounties, GT flow, achievements and rank. Read-only aggregation over the current
// month (seasons.monthBounds) — no new model. The number-crunching helpers are pure +
// unit-tested; getWrapped just runs the (cheap, indexed) queries and assembles them.
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/seasons";
import { getMyLeagueStats } from "@/lib/prediction-leagues";

export type WrappedData = {
  season: { number: number; label: string };
  user: { name: string; username: string | null; image: string | null; level: number; prestige: number };
  rank: number | null;
  league: { rank: number; net: number; winRate: number; plays: number } | null;
  bounties: { created: number; backed: number; pledgedGt: number };
  gt: { earned: number; spent: number };
  achievementsThisSeason: number;
  achievementsTotal: number;
  vibe: WrappedVibe;
};

export type WrappedVibe = "legend" | "sharp" | "profit" | "active" | "newcomer";

/** Pure: pick a personalised "vibe" from the recap stats (UI maps it to a headline). Unit-tested. */
export function pickWrappedVibe(d: Pick<WrappedData, "league" | "gt" | "bounties">): WrappedVibe {
  if (d.league && d.league.rank === 1 && d.league.plays > 0) return "legend";
  if (d.league && d.league.plays >= 3 && d.league.winRate >= 0.6) return "sharp";
  if (d.gt.earned > d.gt.spent && d.gt.earned > 0) return "profit";
  if (d.bounties.created + d.bounties.backed + (d.league?.plays ?? 0) > 0) return "active";
  return "newcomer";
}

/** Pure: collapse a Transaction groupBy([type]) into { earned, spent } (spend amounts are negative). */
export function summarizeGtFlow(rows: Array<{ type: string; _sum: { amount: number | null } }>): { earned: number; spent: number } {
  const earned = rows.find((r) => r.type === "earn")?._sum.amount ?? 0;
  const spent = Math.abs(rows.find((r) => r.type === "spend")?._sum.amount ?? 0);
  return { earned, spent };
}

type NameRow = { name: string | null; displayName: string | null; username: string | null };
function displayName(c: NameRow | null | undefined): string {
  return c?.displayName || c?.name || c?.username || "Widmo";
}

export async function getWrapped(userId: string, tenantId: string | null, monthsBack = 0): Promise<WrappedData | null> {
  // monthsBack lets the recap show PRIOR months (#788/B2). 0 = current month (default → existing
  // callers like the OG cards / public page are unchanged). Clamped to the last 12 months.
  const clamped = Math.max(0, Math.min(11, Math.floor(monthsBack)));
  const nowD = new Date();
  const target = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - clamped, 1));
  const { start, end, number, label } = monthBounds(target);
  const inMonth = { gte: start, lt: end };

  const [user, league, bountiesCreated, pledges, gtRows, achSeason, achTotal] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, displayName: true, username: true, image: true, level: true, prestige: true, tokens: true },
    }),
    // The live Prediction League is a CURRENT-month standing; for a past month omit it (a
    // historical recompute would need a season-scoped query) rather than show stale data.
    clamped === 0 ? getMyLeagueStats(userId, tenantId) : Promise.resolve(null),
    prisma.bounty.count({ where: { creatorId: userId, createdAt: inMonth, ...(tenantId ? { tenantId } : {}) } }),
    prisma.bountyPledge.findMany({ where: { userId, createdAt: inMonth }, select: { bountyId: true, amount: true } }),
    prisma.transaction.groupBy({ by: ["type"], where: { userId, createdAt: inMonth, type: { in: ["earn", "spend"] } }, _sum: { amount: true } }),
    prisma.userAchievement.count({ where: { userId, earnedAt: inMonth } }),
    prisma.userAchievement.count({ where: { userId } }),
  ]);
  if (!user) return null;

  // Current GT rank within the portal (cheap: count of users strictly above).
  const rank = (await prisma.user.count({ where: { tokens: { gt: user.tokens }, ...(tenantId ? { tenantId } : {}) } })) + 1;

  const backed = new Set(pledges.map((p) => p.bountyId)).size;
  const pledgedGt = pledges.reduce((s, p) => s + p.amount, 0);
  const leagueSummary = league ? { rank: league.rank, net: league.net, winRate: league.winRate, plays: league.plays } : null;
  const bounties = { created: bountiesCreated, backed, pledgedGt };
  const gt = summarizeGtFlow(gtRows);

  return {
    season: { number, label },
    user: { name: displayName(user), username: user.username, image: user.image, level: user.level, prestige: user.prestige },
    rank,
    league: leagueSummary,
    bounties,
    gt,
    achievementsThisSeason: achSeason,
    achievementsTotal: achTotal,
    vibe: pickWrappedVibe({ league: leagueSummary, gt, bounties }),
  };
}
