import { describe, it, expect } from "vitest";
import { computePayouts, tierFromXp, plnFromCurrency } from "@/lib/economy";

describe("computePayouts", () => {
  it("gives the whole pot to a single winner", () => {
    expect(computePayouts([100], 250)).toEqual([250]);
  });

  it("splits proportionally to stake", () => {
    // stakes 100 + 300 → shares 1/4 and 3/4 of an 800 pot
    expect(computePayouts([100, 300], 800)).toEqual([200, 600]);
  });

  it("floors each share and the last winner absorbs the remainder", () => {
    // 1/3 of 100 = 33.33 → 33, 33, last = 100 - 66 = 34
    expect(computePayouts([1, 1, 1], 100)).toEqual([33, 33, 34]);
  });

  it("always distributes exactly the pot (no rounding gain or loss)", () => {
    const stakes = [33, 33, 34];
    const pot = 1000;
    const payouts = computePayouts(stakes, pot);
    expect(payouts.reduce((a, b) => a + b, 0)).toBe(pot);
  });

  it("never pays a single winner more than the whole pot", () => {
    const payouts = computePayouts([5, 5], 7);
    expect(Math.max(...payouts)).toBeLessThanOrEqual(7);
    expect(payouts.reduce((a, b) => a + b, 0)).toBe(7);
  });

  it("returns an empty array when there are no winners", () => {
    expect(computePayouts([], 500)).toEqual([]);
  });

  it("returns zeros when the total stake is zero", () => {
    expect(computePayouts([0, 0], 500)).toEqual([0, 0]);
  });
});

describe("tierFromXp", () => {
  it("stays at tier 0 below the first threshold", () => {
    expect(tierFromXp(0, 5000, 30)).toBe(0);
    expect(tierFromXp(4999, 5000, 30)).toBe(0);
  });

  it("advances one tier per xpPerTier", () => {
    expect(tierFromXp(5000, 5000, 30)).toBe(1);
    expect(tierFromXp(12500, 5000, 30)).toBe(2);
  });

  it("caps at totalTiers", () => {
    expect(tierFromXp(1_000_000, 5000, 30)).toBe(30);
  });

  it("guards against a zero xpPerTier", () => {
    expect(tierFromXp(100, 0, 30)).toBe(0);
  });
});

describe("plnFromCurrency", () => {
  it("passes PLN (and the ZL alias) through unchanged, case-insensitively", () => {
    expect(plnFromCurrency(50, "PLN")).toBe(50);
    expect(plnFromCurrency(50, "pln")).toBe(50);
    expect(plnFromCurrency(50, "ZL")).toBe(50);
  });

  it("applies the ×4 USD-equivalent fallback to other currencies", () => {
    expect(plnFromCurrency(10, "USD")).toBe(40);
    expect(plnFromCurrency(10, "eur")).toBe(40);
  });
});
