import { describe, it, expect } from "vitest";
import { milestoneReward, loyaltyTier, nextMilestone, computeStreak } from "../watch-streak";

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
