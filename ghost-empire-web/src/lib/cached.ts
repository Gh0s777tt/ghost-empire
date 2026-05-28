// src/lib/cached.ts
// Cached wrappers around public, non-personalized DB reads. On Supabase free tier
// (1-3 connections) the win is large: N identical ranking/homepage queries per
// minute collapse into 1 DB hit per revalidate window.
//
// IMPORTANT: only cache queries whose SELECT returns no `Date` fields — unstable_cache
// JSON-serializes results, turning Date → string, which breaks any later `.toISOString()`.
// All selects below are scalar-only (numbers/strings/booleans) → safe.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export type RankedUser = {
  id: string;
  username: string | null;
  displayName: string | null;
  name: string | null;
  image: string | null;
  tokens: number;
  totalEarned: number;
  level: number;
  xp: number;
  streak: number;
  isAdmin: boolean;
  isBanned: boolean;
};

const RANK_SELECT = {
  id: true, username: true, displayName: true, name: true, image: true,
  tokens: true, totalEarned: true, level: true, xp: true, streak: true,
  isAdmin: true, isBanned: true,
} as const;

/**
 * Top-100 ranking for a given sort metric + total counts. Cached 45s per sort.
 * Tagged "ranking" so admin token grants could revalidateTag("ranking") later.
 */
export const getCachedRanking = (sort: "tokens" | "totalEarned" | "level" | "streak") =>
  unstable_cache(
    async () => {
      const orderBy =
        sort === "level"
          ? [{ level: "desc" as const }, { xp: "desc" as const }]
          : [{ [sort]: "desc" as const }];
      const where = { [sort]: { gt: 0 } };

      const [topUsers, totalRanked, totalUsers] = await Promise.all([
        prisma.user.findMany({ where, orderBy, take: 100, select: RANK_SELECT }),
        prisma.user.count({ where }),
        prisma.user.count(),
      ]);
      return { topUsers: topUsers as RankedUser[], totalRanked, totalUsers };
    },
    ["ranking", sort],
    { revalidate: 45, tags: ["ranking"] },
  )();

export type CachedAchievement = {
  id: string; code: string; name: string; description: string; icon: string;
  rarity: string; hidden: boolean; triggerType: string | null; triggerValue: number | null;
  xpReward: number; tokenReward: number;
};

/**
 * Achievements master list + global earned-counts + total users. All public/global.
 * The master list basically never changes (only on seed/deploy); earned-counts drift
 * but 2-min staleness on a "% of users earned this" stat is fine. Cached 120s.
 * Selects only Date-free columns so it's safe to JSON-cache.
 */
export const getCachedAchievementsMeta = () =>
  unstable_cache(
    async () => {
      const [achievements, totalUsers, grouped] = await Promise.all([
        prisma.achievement.findMany({
          orderBy: [{ rarity: "asc" }, { triggerValue: "asc" }, { name: "asc" }],
          select: {
            id: true, code: true, name: true, description: true, icon: true,
            rarity: true, hidden: true, triggerType: true, triggerValue: true,
            xpReward: true, tokenReward: true,
          },
        }),
        prisma.user.count(),
        prisma.userAchievement.groupBy({ by: ["achievementId"], _count: { id: true } }),
      ]);
      const earnedCounts = grouped.map((g) => ({ achievementId: g.achievementId, count: g._count.id }));
      return { achievements: achievements as CachedAchievement[], totalUsers, earnedCounts };
    },
    ["achievements-meta"],
    { revalidate: 120, tags: ["achievements"] },
  )();

/** Homepage top-N preview. Cached 60s. */
export const getCachedTopUsers = (limit = 3) =>
  unstable_cache(
    async () => {
      return prisma.user.findMany({
        where: { tokens: { gt: 0 } },
        orderBy: { tokens: "desc" },
        take: limit,
        select: { id: true, username: true, displayName: true, image: true, tokens: true, level: true },
      });
    },
    ["home-top-users", String(limit)],
    { revalidate: 60, tags: ["ranking"] },
  )();
