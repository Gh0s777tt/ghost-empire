import { describe, it, expect } from "vitest";
import { isWarLive, warTimeRemaining, clampWarDays, clampPrize, warDurationDays, WAR_MIN_DAYS, WAR_MAX_DAYS, WAR_MAX_PRIZE } from "@/lib/clan-wars";

const NOW = 1_000_000_000_000;

describe("isWarLive", () => {
  it("is live only when active and before endsAt", () => {
    expect(isWarLive({ status: "active", endsAt: new Date(NOW + 1000) }, NOW)).toBe(true);
    expect(isWarLive({ status: "active", endsAt: new Date(NOW - 1000) }, NOW)).toBe(false);
    expect(isWarLive({ status: "ended", endsAt: new Date(NOW + 1000) }, NOW)).toBe(false);
  });
});

describe("warTimeRemaining", () => {
  it("returns remaining ms, floored at 0", () => {
    expect(warTimeRemaining(new Date(NOW + 5000), NOW)).toBe(5000);
    expect(warTimeRemaining(new Date(NOW - 5000), NOW)).toBe(0);
  });
});

describe("clampWarDays", () => {
  it("clamps to whole days within bounds", () => {
    expect(clampWarDays(7)).toBe(7);
    expect(clampWarDays(0)).toBe(WAR_MIN_DAYS);
    expect(clampWarDays(999)).toBe(WAR_MAX_DAYS);
    expect(clampWarDays(3.9)).toBe(3);
    expect(clampWarDays(NaN)).toBe(WAR_MIN_DAYS);
  });
});

describe("clampPrize", () => {
  it("clamps to [0, max] whole GT", () => {
    expect(clampPrize(5000)).toBe(5000);
    expect(clampPrize(-10)).toBe(0);
    expect(clampPrize(WAR_MAX_PRIZE + 1)).toBe(WAR_MAX_PRIZE);
    expect(clampPrize(12.7)).toBe(12);
  });
});

describe("warDurationDays", () => {
  const day = 86_400_000;
  it("rounds the span to whole days, floored at 1", () => {
    const start = new Date(NOW);
    expect(warDurationDays(start, new Date(NOW + 7 * day))).toBe(7);
    expect(warDurationDays(start, new Date(NOW + day))).toBe(1);
    expect(warDurationDays(start, new Date(NOW + 12 * 3_600_000))).toBe(1); // 12h → min 1
    expect(warDurationDays(start, new Date(NOW + 2.5 * day))).toBe(3); // rounds up at .5
  });
});
