import { describe, it, expect } from "vitest";
import { achievementProgress } from "@/lib/achievement-progress";

const stats = { level: 8, totalEarned: 5000, streak: 3, messageCount: 120 };

describe("achievementProgress", () => {
  it("maps each threshold trigger to the right stat and computes %", () => {
    expect(achievementProgress("level", 10, stats)).toEqual({ current: 8, target: 10, pct: 80 });
    expect(achievementProgress("tokens_earned", 10000, stats)).toEqual({ current: 5000, target: 10000, pct: 50 });
    expect(achievementProgress("streak", 7, stats)).toEqual({ current: 3, target: 7, pct: 43 });
    expect(achievementProgress("messages", 100, stats)).toEqual({ current: 120, target: 100, pct: 100 });
  });

  it("caps at 100% when the viewer is past the threshold", () => {
    expect(achievementProgress("level", 5, stats)!.pct).toBe(100);
    expect(achievementProgress("level", 5, stats)!.current).toBe(8); // raw current still reported
  });

  it("returns null when no inline bar applies", () => {
    expect(achievementProgress("manual", 1, stats)).toBeNull();
    expect(achievementProgress("donations_count", 5, stats)).toBeNull(); // dynamic trigger, not in stats
    expect(achievementProgress("level", null, stats)).toBeNull();
    expect(achievementProgress("level", 0, stats)).toBeNull();
    expect(achievementProgress(null, 10, stats)).toBeNull();
    expect(achievementProgress("level", 10, null)).toBeNull(); // logged-out
  });

  it("treats a negative/zero stat as 0%", () => {
    expect(achievementProgress("level", 10, { ...stats, level: 0 })).toEqual({ current: 0, target: 10, pct: 0 });
  });
});
