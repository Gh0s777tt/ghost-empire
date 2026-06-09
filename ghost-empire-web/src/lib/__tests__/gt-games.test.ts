import { describe, it, expect } from "vitest";
import { spinSlots, flipCoin, SLOT_SYMBOLS, rouletteColor, spinRoulette, normRouletteChoice, normDiceChoice, rollDice, diceWinChance, diceMultiplier } from "@/lib/gt-games";

describe("slots", () => {
  it("always returns 3 reels and a non-negative multiplier", () => {
    for (let i = 0; i < 100; i++) {
      const o = spinSlots();
      expect(o.reels).toHaveLength(3);
      expect(o.multiplier).toBeGreaterThanOrEqual(0);
    }
  });

  it("pays only on a 3-of-a-kind, with that symbol's multiplier", () => {
    // Force all reels to index 5 (the jackpot) via a deterministic rng at the top.
    const jackpot = spinSlots(() => 0.999999);
    expect(jackpot.reels.every((r) => r === jackpot.reels[0])).toBe(true);
    expect(jackpot.multiplier).toBe(SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].mult);

    // Force all reels to index 0 (first symbol).
    const low = spinSlots(() => 0);
    expect(low.reels.every((r) => r === low.reels[0])).toBe(true);
    expect(low.multiplier).toBe(SLOT_SYMBOLS[0].mult);
  });

  it("has a sane RTP (house edge present but not brutal)", () => {
    const N = 200_000;
    let staked = 0;
    let returned = 0;
    for (let i = 0; i < N; i++) {
      staked += 1;
      returned += spinSlots().multiplier; // bet of 1 → payout = multiplier
    }
    const rtp = returned / staked;
    expect(rtp).toBeGreaterThan(0.7);
    expect(rtp).toBeLessThan(0.98);
  });
});

describe("coinflip", () => {
  it("pays 2× on a win, 0 on a loss", () => {
    expect(flipCoin(() => 0).multiplier).toBe(2);   // < 0.48 → win
    expect(flipCoin(() => 0.9).multiplier).toBe(0);  // ≥ 0.48 → loss
  });

  it("wins roughly 48% of the time (house edge)", () => {
    const N = 100_000;
    let wins = 0;
    for (let i = 0; i < N; i++) if (flipCoin().win) wins++;
    expect(Math.abs(wins / N - 0.48)).toBeLessThan(0.02);
  });
});

describe("dice", () => {
  it("normalizes under/over bets (':' or space separator) and rejects out-of-range/junk", () => {
    expect(normDiceChoice("under:50")).toEqual({ dir: "under", target: 50 });
    expect(normDiceChoice("over 25")).toEqual({ dir: "over", target: 25 });
    expect(normDiceChoice("UNDER:2")).toEqual({ dir: "under", target: 2 });
    expect(normDiceChoice("over:98")).toEqual({ dir: "over", target: 98 });
    expect(normDiceChoice("under:1")).toBeNull();   // below min
    expect(normDiceChoice("over:99")).toBeNull();    // above max
    expect(normDiceChoice("sideways:50")).toBeNull();
    expect(normDiceChoice("under:abc")).toBeNull();
    expect(normDiceChoice("")).toBeNull();
  });

  it("win chance and multiplier are complementary and carry the house edge", () => {
    // under:50 → 50% chance; fair mult 2× minus 5% edge = 1.9×
    expect(diceWinChance("under", 50)).toBeCloseTo(0.5);
    expect(diceMultiplier("under", 50)).toBeCloseTo(1.9);
    // over:50 → 50% (rolls 50..99) → same
    expect(diceWinChance("over", 50)).toBeCloseTo(0.5);
    // under:25 → 25% chance → higher payout (0.95/0.25 = 3.8×)
    expect(diceWinChance("under", 25)).toBeCloseTo(0.25);
    expect(diceMultiplier("under", 25)).toBeCloseTo(3.8);
  });

  it("resolves a roll against the threshold (under wins low, over wins high)", () => {
    // rng 0 → roll 0: under:50 wins, over:50 loses
    expect(rollDice("under", 50, () => 0).win).toBe(true);
    expect(rollDice("over", 50, () => 0).win).toBe(false);
    // rng ~just under 1 → roll 99: under:50 loses, over:50 wins
    expect(rollDice("under", 50, () => 0.9999).win).toBe(false);
    expect(rollDice("over", 50, () => 0.9999).win).toBe(true);
    // boundary: roll == target → "under" loses (strict <), "over" wins (≥)
    expect(rollDice("under", 50, () => 0.5).roll).toBe(50);
    expect(rollDice("under", 50, () => 0.5).win).toBe(false);
    expect(rollDice("over", 50, () => 0.5).win).toBe(true);
  });

  it("has RTP ≈ 0.95 across a range of thresholds (Monte-Carlo)", () => {
    const N = 100_000;
    for (const [dir, target] of [["under", 50], ["over", 75], ["under", 20]] as const) {
      let returned = 0;
      for (let i = 0; i < N; i++) {
        const o = rollDice(dir, target);
        if (o.win) returned += o.multiplier; // bet of 1 → payout = multiplier
      }
      const rtp = returned / N;
      expect(rtp).toBeGreaterThan(0.92);
      expect(rtp).toBeLessThan(0.98);
    }
  });
});

describe("roulette", () => {
  it("colors the American wheel correctly (0 & 00 green, known reds/blacks)", () => {
    expect(rouletteColor(0)).toBe("green");
    expect(rouletteColor(37)).toBe("green"); // 37 = "00"
    expect(rouletteColor(1)).toBe("red");   // 1 is red
    expect(rouletteColor(2)).toBe("black"); // 2 is black
    expect(rouletteColor(36)).toBe("red");  // 36 is red
  });

  it("normalizes bet choices (red/black aliases + 0-36 + 00) and rejects junk", () => {
    expect(normRouletteChoice("RED")).toBe("red");
    expect(normRouletteChoice("czarne")).toBe("black");
    expect(normRouletteChoice("17")).toBe("17");
    expect(normRouletteChoice("0")).toBe("0");
    expect(normRouletteChoice("00")).toBe("00");   // double zero
    expect(normRouletteChoice("37")).toBeNull();   // 37 is the internal "00" code, not a valid bet string
    expect(normRouletteChoice("blue")).toBeNull();
    expect(normRouletteChoice("")).toBeNull();
  });

  it("spins 38 pockets (incl. 00) and pays 2× for color, 36× for the exact number", () => {
    // rng 0 → pocket 0 (green) → red/black lose, number 0 wins
    expect(spinRoulette("red", () => 0).multiplier).toBe(0);
    expect(spinRoulette("0", () => 0).multiplier).toBe(36);
    // rng ~just under 1 → pocket 37 = "00" (green) → red/black lose, "00" wins 36×
    const last = () => 0.9999999;
    expect(spinRoulette("00", last).n).toBe(37);
    expect(spinRoulette("red", last).multiplier).toBe(0);
    expect(spinRoulette("00", last).multiplier).toBe(36);
    // a value landing on pocket 36 (red): 36/38 ≤ v < 37/38
    const p36 = () => 36 / 38 + 0.001;
    expect(spinRoulette("36", p36).n).toBe(36);
    expect(spinRoulette("red", p36).multiplier).toBe(2);
    expect(spinRoulette("black", p36).multiplier).toBe(0);
    expect(spinRoulette("36", p36).multiplier).toBe(36);
  });

  it("red/black has a sane RTP (~0.947 — double-zero house edge)", () => {
    const N = 200_000;
    let returned = 0;
    for (let i = 0; i < N; i++) returned += spinRoulette("red").multiplier; // bet 1
    const rtp = returned / N;
    expect(rtp).toBeGreaterThan(0.92);
    expect(rtp).toBeLessThan(0.97);
  });
});
