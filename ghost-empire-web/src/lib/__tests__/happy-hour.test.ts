import { describe, it, expect } from "vitest";
import { isHappyHourActive, warsawHour } from "@/lib/happy-hour";

const cfg = (over: Partial<{ enabled: boolean; startHour: number; endHour: number; multiplier: number }> = {}) => ({
  enabled: true, startHour: 19, endHour: 22, multiplier: 2, ...over,
});

describe("happy hour", () => {
  it("converts to Europe/Warsaw correctly (DST-aware)", () => {
    expect(warsawHour(new Date("2026-01-15T18:30:00Z"))).toBe(19); // winter CET = UTC+1
    expect(warsawHour(new Date("2026-06-15T18:30:00Z"))).toBe(20); // summer CEST = UTC+2
  });

  it("is active inside the window and inactive outside", () => {
    expect(isHappyHourActive(cfg(), new Date("2026-01-15T18:30:00Z"))).toBe(true);  // 19:30 PL
    expect(isHappyHourActive(cfg(), new Date("2026-01-15T16:30:00Z"))).toBe(false); // 17:30 PL
    expect(isHappyHourActive(cfg(), new Date("2026-01-15T21:30:00Z"))).toBe(false); // 22:30 PL (end exclusive)
  });

  it("supports overnight windows (start > end)", () => {
    const night = cfg({ startHour: 22, endHour: 2 });
    expect(isHappyHourActive(night, new Date("2026-01-15T22:30:00Z"))).toBe(true);  // 23:30 PL
    expect(isHappyHourActive(night, new Date("2026-01-15T11:00:00Z"))).toBe(false); // 12:00 PL
  });

  it("is never active when disabled or multiplier <= 1", () => {
    expect(isHappyHourActive(cfg({ enabled: false }), new Date("2026-01-15T18:30:00Z"))).toBe(false);
    expect(isHappyHourActive(cfg({ multiplier: 1 }), new Date("2026-01-15T18:30:00Z"))).toBe(false);
  });
});
