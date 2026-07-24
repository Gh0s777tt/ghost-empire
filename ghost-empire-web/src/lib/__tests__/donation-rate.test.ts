// src/lib/__tests__/donation-rate.test.ts
import { describe, it, expect } from "vitest";
import { gtFromPln } from "@/lib/donation-rate";

describe("gtFromPln", () => {
  it("mints at the given rate, rounded", () => {
    expect(gtFromPln(10, 100)).toBe(1000);
    expect(gtFromPln(4.99, 100)).toBe(499);
    expect(gtFromPln(0.005, 100)).toBe(1); // rounds
  });

  it("caps a huge/malformed amount", () => {
    expect(gtFromPln(1_000_000, 100, 10_000_000)).toBe(10_000_000); // 1M PLN capped
    expect(gtFromPln(Number.MAX_SAFE_INTEGER, 100, 10_000_000)).toBe(10_000_000);
  });

  it("returns 0 for non-positive / non-finite input (no negative or NaN mint)", () => {
    expect(gtFromPln(0, 100)).toBe(0);
    expect(gtFromPln(-50, 100)).toBe(0);
    expect(gtFromPln(NaN, 100)).toBe(0);
    expect(gtFromPln(Infinity, 100)).toBe(0);
  });
});
