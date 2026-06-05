import { describe, it, expect } from "vitest";
import {
  computePayouts, tierFromXp, plnFromCurrency, pickWeightedIndex, levelGtMultiplier,
  prestigeFromXp, prestigeGtMultiplier, LEVEL_CAP_XP, PRESTIGE_XP,
  shopDiscountFraction, discountedPrice, duelPayout, pickDuelWinner, DUEL_RAKE,
} from "@/lib/economy";

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

describe("levelGtMultiplier (account-level GT perk)", () => {
  it("grows +0.5%/level capped at +50%", () => {
    expect(levelGtMultiplier(1)).toBeCloseTo(1.0);
    expect(levelGtMultiplier(11)).toBeCloseTo(1.05);
    expect(levelGtMultiplier(101)).toBeCloseTo(1.5);
    expect(levelGtMultiplier(1000)).toBeCloseTo(1.5); // capped
  });
});

describe("prestigeFromXp (Phantom Ascension)", () => {
  it("is 0 until the level cap is reached", () => {
    expect(prestigeFromXp(0)).toBe(0);
    expect(prestigeFromXp(LEVEL_CAP_XP - 1)).toBe(0);
    expect(prestigeFromXp(LEVEL_CAP_XP)).toBe(0); // hit level 100, prestige not yet earned
  });

  it("grants +1 star per PRESTIGE_XP of overflow past the cap", () => {
    expect(prestigeFromXp(LEVEL_CAP_XP + PRESTIGE_XP - 1)).toBe(0);
    expect(prestigeFromXp(LEVEL_CAP_XP + PRESTIGE_XP)).toBe(1);
    expect(prestigeFromXp(LEVEL_CAP_XP + 2 * PRESTIGE_XP)).toBe(2);
    expect(prestigeFromXp(LEVEL_CAP_XP + 5 * PRESTIGE_XP + 123)).toBe(5);
  });

  it("never goes negative for tiny XP totals", () => {
    expect(prestigeFromXp(-100)).toBe(0);
  });
});

describe("prestigeGtMultiplier (prestige GT perk)", () => {
  it("grows +2%/star capped at +50%", () => {
    expect(prestigeGtMultiplier(0)).toBeCloseTo(1.0);
    expect(prestigeGtMultiplier(1)).toBeCloseTo(1.02);
    expect(prestigeGtMultiplier(10)).toBeCloseTo(1.2);
    expect(prestigeGtMultiplier(25)).toBeCloseTo(1.5);
    expect(prestigeGtMultiplier(1000)).toBeCloseTo(1.5); // capped
  });

  it("never drops below 1× for nonsense input", () => {
    expect(prestigeGtMultiplier(-5)).toBeCloseTo(1.0);
  });
});

describe("shopDiscountFraction / discountedPrice (loyalty perk)", () => {
  it("is 0 at level 1 / prestige 0 (no discount for newcomers)", () => {
    expect(shopDiscountFraction(1, 0)).toBe(0);
    expect(discountedPrice(1000, 1, 0)).toBe(1000);
  });

  it("grows -0.15%/level and -1%/prestige star", () => {
    expect(shopDiscountFraction(101, 0)).toBeCloseTo(0.15); // 100 levels * 0.0015
    expect(shopDiscountFraction(1, 5)).toBeCloseTo(0.05);   // 5 stars * 0.01
    expect(shopDiscountFraction(101, 5)).toBeCloseTo(0.20);
  });

  it("caps the combined discount at -30%", () => {
    expect(shopDiscountFraction(1000, 1000)).toBeCloseTo(0.3);
    expect(discountedPrice(1000, 1000, 1000)).toBe(700);
  });

  it("rounds to an integer and never goes below 1 GT", () => {
    expect(discountedPrice(999, 101, 0)).toBe(Math.round(999 * 0.85)); // 849
    expect(discountedPrice(1, 1000, 1000)).toBe(1);
  });
});

describe("duelPayout (PvP pot split)", () => {
  it("winner takes the pot minus the default 5% rake", () => {
    expect(duelPayout(100)).toEqual({ pot: 200, rake: 10, winnerTakes: 190 });
    expect(duelPayout(1000)).toEqual({ pot: 2000, rake: 100, winnerTakes: 1900 });
  });

  it("rake is floored (winner never overpaid)", () => {
    // pot 50, 5% = 2.5 → floor 2 → winner 48
    expect(duelPayout(25)).toEqual({ pot: 50, rake: 2, winnerTakes: 48 });
  });

  it("supports a zero-rake (winner-takes-all) override", () => {
    expect(duelPayout(100, 0)).toEqual({ pot: 200, rake: 0, winnerTakes: 200 });
  });

  it("DUEL_RAKE is a sane sink fraction (0..1)", () => {
    expect(DUEL_RAKE).toBeGreaterThan(0);
    expect(DUEL_RAKE).toBeLessThan(1);
  });
});

describe("pickDuelWinner (fairness)", () => {
  it("returns 0 for challenger when rng < 0.5, else 1", () => {
    expect(pickDuelWinner(() => 0.0)).toBe(0);
    expect(pickDuelWinner(() => 0.49)).toBe(0);
    expect(pickDuelWinner(() => 0.5)).toBe(1);
    expect(pickDuelWinner(() => 0.99)).toBe(1);
  });

  it("is ~50/50 over many flips", () => {
    let challengerWins = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) if (pickDuelWinner() === 0) challengerWins++;
    expect(Math.abs(challengerWins / N - 0.5)).toBeLessThan(0.03); // within 3pp
  });
});
