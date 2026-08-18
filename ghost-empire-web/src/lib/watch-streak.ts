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

// ─── Streak Freeze (ochrona serii) ───────────────────────────────────────────
// A viewer buys "freezes" for GT; a freeze auto-bridges a SINGLE missed day so one lapse doesn't
// reset a long streak (the Duolingo streak-freeze). NO schema change — consistent with the rest of
// this subsystem: a freeze BOUGHT is a `Transaction(reason FREEZE_BUY, spend)`, a freeze CONSUMED is
// a `Transaction(reason FREEZE_USE)` whose UTC day BRIDGES the gap. Owned = count(bought) − count(used).
// A bridged day keeps the run alive but is NOT itself counted as a watched day (else a freeze would
// silently add a day to the streak).
export const FREEZE_BUY = "streak-freeze:buy";
export const FREEZE_USE = "streak-freeze:use";
export const FREEZE_COST = 500; // GT per freeze
export const FREEZE_MAX_OWNED = 2; // hold at most this many at once (bounds the sink + abuse)

/**
 * Pure: consecutive WATCHED days ending at `endDay`. `bridges` (consumed-freeze days) preserve
 * continuity across a gap but are NOT counted toward the streak. The run stops at the first day that
 * is neither watched nor bridged.
 */
export function streakEndingAt(watched: Set<number>, bridges: Set<number>, endDay: number, dayMs = DAY): number {
  let streak = 0;
  let cursor = endDay;
  while (true) {
    if (watched.has(cursor)) { streak++; cursor -= dayMs; continue; }
    if (bridges.has(cursor)) { cursor -= dayMs; continue; } // freeze-bridged: keeps the run alive, uncounted
    break;
  }
  return streak;
}

export type FreezeDisplay = { claimedToday: boolean; streak: number; protected: boolean };

/**
 * Pure: the streak to SHOW and whether an owned freeze is currently shielding a FRESH single-day gap.
 * `protected` is true when today isn't claimed yet, yesterday is a fresh gap, the day before is part
 * of the run, and the viewer owns ≥1 freeze — i.e. checking in today will spend a freeze and keep the
 * run alive (so the card can reassure instead of showing a scary reset).
 */
export function freezeDisplay(watched: Set<number>, bridges: Set<number>, today0: number, owned: number, dayMs = DAY): FreezeDisplay {
  const claimedToday = watched.has(today0);
  if (claimedToday) return { claimedToday: true, streak: streakEndingAt(watched, bridges, today0, dayMs), protected: false };
  const yesterday = today0 - dayMs;
  if (watched.has(yesterday) || bridges.has(yesterday)) {
    return { claimedToday: false, streak: streakEndingAt(watched, bridges, yesterday, dayMs), protected: false };
  }
  const dayBefore = today0 - 2 * dayMs;
  if (owned > 0 && (watched.has(dayBefore) || bridges.has(dayBefore))) {
    return { claimedToday: false, streak: streakEndingAt(watched, bridges, dayBefore, dayMs), protected: true };
  }
  return { claimedToday: false, streak: 0, protected: false };
}

export type ClaimPlan = { claimedToday: boolean; willBridge: boolean; bridgeDay: number | null; priorStreak: number };

/**
 * Pure: decide what checking in TODAY does — the streak BEFORE today, and whether a freeze must be
 * spent to bridge yesterday's single-day gap. `bridgeDay` is the UTC day to write a FREEZE_USE marker
 * for (yesterday) when `willBridge`.
 */
export function claimPlan(watched: Set<number>, bridges: Set<number>, today0: number, owned: number, dayMs = DAY): ClaimPlan {
  const claimedToday = watched.has(today0);
  const yesterday = today0 - dayMs;
  if (watched.has(yesterday) || bridges.has(yesterday)) {
    return { claimedToday, willBridge: false, bridgeDay: null, priorStreak: streakEndingAt(watched, bridges, yesterday, dayMs) };
  }
  const dayBefore = today0 - 2 * dayMs;
  if (owned > 0 && (watched.has(dayBefore) || bridges.has(dayBefore))) {
    return { claimedToday, willBridge: true, bridgeDay: yesterday, priorStreak: streakEndingAt(watched, bridges, dayBefore, dayMs) };
  }
  return { claimedToday, willBridge: false, bridgeDay: null, priorStreak: 0 };
}

export type WatchStreakStatus = {
  claimedToday: boolean;
  streak: number;
  tier: LoyaltyTier;
  nextDays: number | null; // days needed for the next milestone (null at top tier)
  nextReward: number | null; // GT at the next milestone (null at top tier)
  freezes: number; // streak-freezes owned (bought − used)
  protected: boolean; // an owned freeze is shielding a fresh single-day gap right now
};

/** How many streak-freezes a user currently owns: count(bought) − count(used), floored at 0. */
export async function ownedFreezes(userId: string): Promise<number> {
  const [bought, used] = await Promise.all([
    prisma.transaction.count({ where: { userId, reason: FREEZE_BUY } }),
    prisma.transaction.count({ where: { userId, reason: FREEZE_USE } }),
  ]);
  return Math.max(0, bought - used);
}

/** A user's current watch-streak status, derived from their check-in + freeze-bridge transactions. */
export async function getWatchStreakStatus(userId: string): Promise<WatchStreakStatus> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY);
  const [txs, owned] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, reason: { in: [REASON, FREEZE_USE] }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, reason: true },
    }),
    ownedFreezes(userId),
  ]);
  const today0 = dayStartUtc(new Date());
  const watched = new Set<number>();
  const bridges = new Set<number>();
  for (const t of txs) (t.reason === FREEZE_USE ? bridges : watched).add(dayStartUtc(t.createdAt));
  const { claimedToday, streak, protected: prot } = freezeDisplay(watched, bridges, today0, owned);
  const next = nextMilestone(streak);
  return {
    claimedToday,
    streak,
    tier: loyaltyTier(streak),
    nextDays: next?.days ?? null,
    nextReward: next?.reward ?? null,
    freezes: owned,
    protected: prot,
  };
}

export type ClaimResult =
  | { ok: true; reward: number; streak: number; tier: LoyaltyTier; newBalance: number; bridged: boolean }
  | { ok: false; status: number; error: string };

/** Claim today's watch day: extends the streak by one and pays the milestone GT if the new
 *  streak hits one. Double-claim-safe via the unique `externalId` (P2002), exactly like
 *  daily-bonus. Non-milestone days record a 0-amount attendance marker (no balance change). */
export async function claimWatchDay(userId: string): Promise<ClaimResult> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY);
  const [txs, owned] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, reason: { in: [REASON, FREEZE_USE] }, createdAt: { gte: since } },
      select: { createdAt: true, reason: true },
    }),
    ownedFreezes(userId),
  ]);
  const today0 = dayStartUtc(new Date());
  const watched = new Set<number>();
  const bridges = new Set<number>();
  for (const t of txs) (t.reason === FREEZE_USE ? bridges : watched).add(dayStartUtc(t.createdAt));
  if (watched.has(today0)) return { ok: false, status: 409, error: "Dzień już zaliczony — wróć jutro!" };

  const plan = claimPlan(watched, bridges, today0, owned);
  const newStreak = plan.priorStreak + 1;
  const reward = milestoneReward(newStreak);
  const externalId = `${REASON}:${userId}:${today0}`;

  try {
    const newBalance = await prisma.$transaction(async (tx) => {
      // Fast path: skip the write if today's check-in already landed.
      const dup = await tx.transaction.findFirst({
        where: { userId, reason: REASON, createdAt: { gte: new Date(today0) } },
        select: { id: true },
      });
      if (dup) throw new Error("DUP");
      // Spend a freeze to bridge yesterday's single-day gap: a 0-amount continuity marker whose
      // unique `externalId` makes a concurrent double-bridge a silent no-op (skipDuplicates). It
      // becomes a `used` row (owned = bought − used) and fills the gap so the streak survives.
      if (plan.willBridge && plan.bridgeDay != null) {
        await tx.transaction.createMany({
          data: [{ userId, type: "spend", amount: 0, reason: FREEZE_USE, externalId: `${FREEZE_USE}:${userId}:${plan.bridgeDay}`, status: "completed" }],
          skipDuplicates: true,
        });
      }
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
            message: `Seria ${newStreak} dni oglądania — odebrano ${reward.toLocaleString("pl-PL")} %gt%.`,
            icon: "🔥",
            link: "/",
          },
        });
      } catch (e) {
        log.error("watch-streak milestone notification failed", e);
      }
    }
    return { ok: true, reward, streak: newStreak, tier: loyaltyTier(newStreak), newBalance, bridged: plan.willBridge };
  } catch (e) {
    if (e instanceof Error && e.message === "DUP") return { ok: false, status: 409, error: "Dzień już zaliczony — wróć jutro!" };
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return { ok: false, status: 409, error: "Dzień już zaliczony — wróć jutro!" };
    }
    log.error("claimWatchDay failed", e);
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}

export type BuyFreezeResult =
  | { ok: true; freezes: number; newBalance: number }
  | { ok: false; status: number; error: string };

/**
 * Buy one streak-freeze for {@link FREEZE_COST} GT, up to {@link FREEZE_MAX_OWNED} owned. Atomic:
 * the `gte` guard makes overspend impossible and the buy row (reason {@link FREEZE_BUY}) is the sink.
 * The owned re-check inside the tx bounds the count; the route's rate-limit + idempotency guard the
 * rapid-double-buy race, so the soft cap can at worst be exceeded by one under extreme concurrency.
 */
export async function buyStreakFreeze(userId: string): Promise<BuyFreezeResult> {
  try {
    const res = await prisma.$transaction(async (tx) => {
      const [bought, used] = await Promise.all([
        tx.transaction.count({ where: { userId, reason: FREEZE_BUY } }),
        tx.transaction.count({ where: { userId, reason: FREEZE_USE } }),
      ]);
      const owned = Math.max(0, bought - used);
      if (owned >= FREEZE_MAX_OWNED) return { reason: "max" as const };
      const dec = await tx.user.updateMany({
        where: { id: userId, tokens: { gte: FREEZE_COST } },
        data: { tokens: { decrement: FREEZE_COST }, totalSpent: { increment: FREEZE_COST } },
      });
      if (dec.count === 0) return { reason: "poor" as const };
      await tx.transaction.create({ data: { userId, type: "spend", amount: -FREEZE_COST, reason: FREEZE_BUY, status: "completed" } });
      const u = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true } });
      return { freezes: owned + 1, balance: u?.tokens ?? 0 };
    });
    if ("reason" in res) {
      return res.reason === "max"
        ? { ok: false, status: 409, error: `Masz już maksimum ochron serii (${FREEZE_MAX_OWNED}).` }
        : { ok: false, status: 402, error: "Za mało %tokenName%" }; // %tokenName% → tenant currency (jsonError)
    }
    return { ok: true, freezes: res.freezes, newBalance: res.balance };
  } catch (e) {
    log.error("buyStreakFreeze failed", e);
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}
