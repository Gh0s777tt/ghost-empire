// src/lib/watch-streak.ts
// Watch Streaks + Loyalty (#687): a daily watch check-in that builds a consecutive-day
// streak and unlocks loyalty tiers + milestone GT rewards (3/7/14/30 days = 100/300/750/2000).
//
// NO schema change (mirrors /api/daily-bonus): a check-in IS a `transaction` row
// (reason "watch-streak"); the streak is derived from those rows' UTC days. Each claim's
// `externalId` is a deterministic "watch-streak:<userId>:<utcDay>" key on the already-unique
// `Transaction.externalId` column, so two concurrent claims race on the unique index and
// exactly one wins (P2002) — no over-credit, no Serializable/retry dance.
//
// Difference from daily-bonus (a flat growing daily payout): here the *daily* check-in pays
// nothing on non-milestone days (a 0-amount attendance marker) — GT only lands when the new
// streak hits a milestone — and the lasting value is the LOYALTY TIER derived from the streak.
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("watch-streak");

export const REASON = "watch-streak";
const DAY = 86_400_000;
// Look back far enough to render very long streaks truthfully (a year of daily check-ins is
// ~365 rows — cheap). Streaks beyond this cap only affect the displayed day count, not rewards
// (nothing new is earned past the 30-day milestone).
const LOOKBACK_DAYS = 370;

export type LoyaltyTier = "none" | "bronze" | "silver" | "gold" | "diamond";

export const WATCH_MILESTONES: ReadonlyArray<{ days: number; reward: number; tier: Exclude<LoyaltyTier, "none"> }> = [
  { days: 3, reward: 100, tier: "bronze" },
  { days: 7, reward: 300, tier: "silver" },
  { days: 14, reward: 750, tier: "gold" },
  { days: 30, reward: 2000, tier: "diamond" },
];

const dayStartUtc = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Pure: GT awarded when a streak *reaches exactly* `streak` days (0 on non-milestone days). */
export function milestoneReward(streak: number): number {
  return WATCH_MILESTONES.find((m) => m.days === streak)?.reward ?? 0;
}

/** Pure: highest loyalty tier reached at a given (current) streak length. */
export function loyaltyTier(streak: number): LoyaltyTier {
  let tier: LoyaltyTier = "none";
  for (const m of WATCH_MILESTONES) if (streak >= m.days) tier = m.tier;
  return tier;
}

/** Pure: the next milestone strictly above `streak` (null once the top one is reached). */
export function nextMilestone(streak: number): { days: number; reward: number; tier: LoyaltyTier } | null {
  return WATCH_MILESTONES.find((m) => m.days > streak) ?? null;
}

/** Pure: consecutive-day run ending today (or yesterday if not yet claimed today), from a
 *  set of UTC-day-start millis. Deterministic — unit-tested. Mirrors the daily-bonus logic. */
export function computeStreak(
  daySetMs: Set<number>,
  todayStartMs: number,
  dayMs = DAY,
): { claimedToday: boolean; streak: number } {
  const claimedToday = daySetMs.has(todayStartMs);
  let streak = 0;
  let cursor = claimedToday ? todayStartMs : todayStartMs - dayMs;
  while (daySetMs.has(cursor)) {
    streak++;
    cursor -= dayMs;
  }
  return { claimedToday, streak };
}

export type WatchStreakStatus = {
  claimedToday: boolean;
  streak: number;
  tier: LoyaltyTier;
  nextDays: number | null; // days needed for the next milestone (null at top tier)
  nextReward: number | null; // GT at the next milestone (null at top tier)
};

/** A user's current watch-streak status, derived from their check-in transactions. */
export async function getWatchStreakStatus(userId: string): Promise<WatchStreakStatus> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY);
  const txs = await prisma.transaction.findMany({
    where: { userId, reason: REASON, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const today0 = dayStartUtc(new Date());
  const days = new Set(txs.map((t) => dayStartUtc(t.createdAt)));
  const { claimedToday, streak } = computeStreak(days, today0);
  const next = nextMilestone(streak);
  return {
    claimedToday,
    streak,
    tier: loyaltyTier(streak),
    nextDays: next?.days ?? null,
    nextReward: next?.reward ?? null,
  };
}

export type ClaimResult =
  | { ok: true; reward: number; streak: number; tier: LoyaltyTier; newBalance: number }
  | { ok: false; status: number; error: string };

/** Claim today's watch day: extends the streak by one and pays the milestone GT if the new
 *  streak hits one. Double-claim-safe via the unique `externalId` (P2002), exactly like
 *  daily-bonus. Non-milestone days record a 0-amount attendance marker (no balance change). */
export async function claimWatchDay(userId: string): Promise<ClaimResult> {
  const before = await getWatchStreakStatus(userId);
  if (before.claimedToday) return { ok: false, status: 409, error: "Dzień już zaliczony — wróć jutro!" };

  const newStreak = before.streak + 1;
  const reward = milestoneReward(newStreak);
  const dayKey = dayStartUtc(new Date());
  const externalId = `${REASON}:${userId}:${dayKey}`;

  try {
    const newBalance = await prisma.$transaction(async (tx) => {
      // Fast path: skip the write if today's check-in already landed.
      const dup = await tx.transaction.findFirst({
        where: { userId, reason: REASON, createdAt: { gte: new Date(dayKey) } },
        select: { id: true },
      });
      if (dup) throw new Error("DUP");
      if (reward > 0) {
        await tx.user.update({ where: { id: userId }, data: { tokens: { increment: reward }, totalEarned: { increment: reward } } });
      }
      // The unique `externalId` is the HARD double-claim guard — a concurrent claim that
      // slipped past the fast-path loses here with P2002.
      await tx.transaction.create({ data: { userId, type: "earn", amount: reward, reason: REASON, externalId, status: "completed" } });
      const u = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true } });
      return u?.tokens ?? 0;
    });
    // Post-commit, best-effort: celebrate a milestone in the bell (never throws into the claim).
    if (reward > 0) {
      try {
        await prisma.notification.create({
          data: {
            userId,
            type: "system",
            title: "🔥 Loyalty milestone!",
            message: `Seria ${newStreak} dni oglądania — odebrano ${reward.toLocaleString("pl-PL")} GT.`,
            icon: "🔥",
            link: "/",
          },
        });
      } catch (e) {
        log.error("watch-streak milestone notification failed", e);
      }
    }
    return { ok: true, reward, streak: newStreak, tier: loyaltyTier(newStreak), newBalance };
  } catch (e) {
    if (e instanceof Error && e.message === "DUP") return { ok: false, status: 409, error: "Dzień już zaliczony — wróć jutro!" };
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return { ok: false, status: 409, error: "Dzień już zaliczony — wróć jutro!" };
    }
    log.error("claimWatchDay failed", e);
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}
