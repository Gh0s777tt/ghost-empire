import { describe, it, expect } from "vitest";
import { spinSlots, flipCoin, SLOT_SYMBOLS } from "@/lib/gt-games";

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
