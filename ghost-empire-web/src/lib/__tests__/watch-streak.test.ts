import { describe, it, expect } from "vitest";
import { milestoneReward, loyaltyTier, nextMilestone, computeStreak, streakEndingAt, freezeDisplay, claimPlan } from "../watch-streak";

const DAY = 86_400_000;
const T = Date.UTC(2026, 5, 27); // a fixed "today" (UTC midnight)
const daysAgo = (n: number) => T - n * DAY;

describe("milestoneReward", () => {
  it("pays only on exact milestone days", () => {
    expect(milestoneReward(3)).toBe(100);
    expect(milestoneReward(7)).toBe(300);
    expect(milestoneReward(14)).toBe(750);
    expect(milestoneReward(30)).toBe(2000);
  });
  it("pays nothing on non-milestone days (incl. 0 and past the top)", () => {
    expect(milestoneReward(0)).toBe(0);
    expect(milestoneReward(1)).toBe(0);
    expect(milestoneReward(6)).toBe(0);
    expect(milestoneReward(31)).toBe(0);
  });
});

describe("loyaltyTier", () => {
  it("returns the highest tier reached for a streak", () => {
    expect(loyaltyTier(0)).toBe("none");
    expect(loyaltyTier(2)).toBe("none");
    expect(loyaltyTier(3)).toBe("bronze");
    expect(loyaltyTier(6)).toBe("bronze");
    expect(loyaltyTier(7)).toBe("silver");
    expect(loyaltyTier(14)).toBe("gold");
    expect(loyaltyTier(29)).toBe("gold");
    expect(loyaltyTier(30)).toBe("diamond");
    expect(loyaltyTier(100)).toBe("diamond");
  });
});

describe("nextMilestone", () => {
  it("returns the next threshold strictly above the streak", () => {
    expect(nextMilestone(0)).toMatchObject({ days: 3, reward: 100 });
    expect(nextMilestone(3)).toMatchObject({ days: 7, reward: 300 });
    expect(nextMilestone(13)).toMatchObject({ days: 14 });
  });
  it("is null once the top milestone is reached", () => {
    expect(nextMilestone(30)).toBeNull();
    expect(nextMilestone(45)).toBeNull();
  });
});

describe("computeStreak", () => {
  it("counts a consecutive run ending today when claimed today", () => {
    const days = new Set([daysAgo(0), daysAgo(1), daysAgo(2)]);
    expect(computeStreak(days, T)).toEqual({ claimedToday: true, streak: 3 });
  });
  it("counts a run ending yesterday when not yet claimed today (streak still alive)", () => {
    const days = new Set([daysAgo(1), daysAgo(2)]);
    expect(computeStreak(days, T)).toEqual({ claimedToday: false, streak: 2 });
  });
  it("stops at the first gap (a missed day breaks the streak)", () => {
    const days = new Set([daysAgo(0), daysAgo(1), daysAgo(3), daysAgo(4)]);
    expect(computeStreak(days, T)).toEqual({ claimedToday: true, streak: 2 });
  });
  it("is 0 when there is no check-in today or yesterday", () => {
    const days = new Set([daysAgo(2), daysAgo(3)]);
    expect(computeStreak(days, T)).toEqual({ claimedToday: false, streak: 0 });
  });
  it("handles an empty history", () => {
    expect(computeStreak(new Set(), T)).toEqual({ claimedToday: false, streak: 0 });
  });
});

describe("streakEndingAt (freeze-aware run)", () => {
  it("counts a plain consecutive run with no bridges", () => {
    expect(streakEndingAt(new Set([daysAgo(1), daysAgo(2), daysAgo(3)]), new Set(), daysAgo(1))).toBe(3);
  });
  it("bridges a gap without counting the bridged day (a freeze preserves, doesn't add)", () => {
    // watched: -1,-3,-4 ; bridge fills -2 → run -1,(-2 bridged),-3,-4 = 3 watched days
    expect(streakEndingAt(new Set([daysAgo(1), daysAgo(3), daysAgo(4)]), new Set([daysAgo(2)]), daysAgo(1))).toBe(3);
  });
  it("stops at a gap that is neither watched nor bridged", () => {
    expect(streakEndingAt(new Set([daysAgo(1), daysAgo(4)]), new Set([daysAgo(2)]), daysAgo(1))).toBe(1);
  });
});

describe("freezeDisplay", () => {
  it("claimed today → run ending today, not protected", () => {
    expect(freezeDisplay(new Set([T, daysAgo(1)]), new Set(), T, 0)).toEqual({ claimedToday: true, streak: 2, protected: false });
  });
  it("not claimed but yesterday watched → run ending yesterday, not protected", () => {
    expect(freezeDisplay(new Set([daysAgo(1), daysAgo(2)]), new Set(), T, 1)).toEqual({ claimedToday: false, streak: 2, protected: false });
  });
  it("fresh single-day gap + owned freeze → PROTECTED, streak held at the run before the gap", () => {
    expect(freezeDisplay(new Set([daysAgo(2), daysAgo(3)]), new Set(), T, 1)).toEqual({ claimedToday: false, streak: 2, protected: true });
  });
  it("fresh single-day gap but NO freeze → streak reset, not protected", () => {
    expect(freezeDisplay(new Set([daysAgo(2), daysAgo(3)]), new Set(), T, 0)).toEqual({ claimedToday: false, streak: 0, protected: false });
  });
  it("a PAST bridge keeps continuity without inflating the count", () => {
    expect(freezeDisplay(new Set([daysAgo(1), daysAgo(3)]), new Set([daysAgo(2)]), T, 0)).toEqual({ claimedToday: false, streak: 2, protected: false });
  });
});

describe("claimPlan", () => {
  it("yesterday watched → no bridge, prior streak counts back from yesterday", () => {
    expect(claimPlan(new Set([daysAgo(1), daysAgo(2)]), new Set(), T, 0)).toEqual({ claimedToday: false, willBridge: false, bridgeDay: null, priorStreak: 2 });
  });
  it("fresh single-day gap + freeze → will bridge yesterday, prior streak from the day before", () => {
    expect(claimPlan(new Set([daysAgo(2), daysAgo(3)]), new Set(), T, 1)).toEqual({ claimedToday: false, willBridge: true, bridgeDay: daysAgo(1), priorStreak: 2 });
  });
  it("fresh single-day gap but no freeze → no bridge, streak resets (prior 0 → claim starts at 1)", () => {
    expect(claimPlan(new Set([daysAgo(2), daysAgo(3)]), new Set(), T, 0)).toEqual({ claimedToday: false, willBridge: false, bridgeDay: null, priorStreak: 0 });
  });
});
