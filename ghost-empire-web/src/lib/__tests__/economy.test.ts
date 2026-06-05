import { describe, it, expect } from "vitest";
import { computePayouts, tierFromXp, plnFromCurrency, pickWeightedIndex } from "@/lib/economy";

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

describe("pickWeightedIndex", () => {
  const weights = [40, 25, 18, 10, 5, 2]; // wheel-of-fortune style distribution

  it("lands in the first segment at the bottom of the range", () => {
    expect(pickWeightedIndex(weights, 0)).toBe(0);
  });

  it("lands in the last segment at the top of the range", () => {
    expect(pickWeightedIndex(weights, 0.999999)).toBe(weights.length - 1);
  });

  it("respects the cumulative boundaries", () => {
    // total = 100. rng 0.40 → exactly the boundary into segment 1; 0.39 still in 0.
    expect(pickWeightedIndex(weights, 0.39)).toBe(0);
    expect(pickWeightedIndex(weights, 0.41)).toBe(1);
    expect(pickWeightedIndex(weights, 0.66)).toBe(2); // 40+25=65 .. 83
  });

  it("skips zero-weight segments entirely", () => {
    // segment 1 has weight 0 → never selected; 0.0 and 0.99 both avoid index 1
    const w = [1, 0, 1];
    expect(pickWeightedIndex(w, 0)).toBe(0);
    expect(pickWeightedIndex(w, 0.99)).toBe(2);
  });

  it("clamps negative weights to zero and falls back to 0 on an all-zero total", () => {
    expect(pickWeightedIndex([0, 0, 0], 0.5)).toBe(0);
    expect(pickWeightedIndex([-5, -5], 0.5)).toBe(0);
  });

  it("roughly matches the distribution over many samples", () => {
    const counts = new Array(weights.length).fill(0);
    const N = 60_000;
    for (let i = 0; i < N; i++) counts[pickWeightedIndex(weights, Math.random())]++;
    const total = weights.reduce((a, b) => a + b, 0);
    weights.forEach((w, i) => {
      const expected = w / total;
      const actual = counts[i] / N;
      expect(Math.abs(actual - expected)).toBeLessThan(0.03); // within 3pp
    });
  });
});
