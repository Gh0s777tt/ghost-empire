// Unit tests for the pure collusion detectors (no DB). Threshold behaviour + ranking.
import { describe, it, expect } from "vitest";
import { flagReferralStars, flagDuelCollusion, flagGiftConcentration, pairKey } from "@/lib/economy-collusion";

describe("flagReferralStars", () => {
  it("flags a referrer with many mostly-inert referred accounts", () => {
    const out = flagReferralStars([{ referrerId: "farm", referredCount: 8, lowActivityCount: 7 }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ referrerId: "farm", score: 7 });
  });
  it("does NOT flag a big streamer with many ACTIVE referrals (low inert ratio)", () => {
    expect(flagReferralStars([{ referrerId: "star", referredCount: 40, lowActivityCount: 3 }])).toEqual([]);
  });
  it("ignores referrers below the minimum referred count", () => {
    expect(flagReferralStars([{ referrerId: "x", referredCount: 4, lowActivityCount: 4 }])).toEqual([]);
  });
  it("ranks by farmed-account count (score) descending", () => {
    const out = flagReferralStars([
      { referrerId: "small", referredCount: 6, lowActivityCount: 5 },
      { referrerId: "big", referredCount: 20, lowActivityCount: 18 },
    ]);
    expect(out.map((f) => f.referrerId)).toEqual(["big", "small"]);
  });
});

describe("flagDuelCollusion", () => {
  it("flags a repeatedly-lopsided pair (chips funneled one way)", () => {
    const out = flagDuelCollusion([{ a: "a", b: "b", total: 10, aWins: 9, bWins: 1 }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ winner: "a", total: 10 });
    expect(out[0].lopsidedness).toBeCloseTo(0.8);
  });
  it("does NOT flag a fair ~50/50 rivalry", () => {
    expect(flagDuelCollusion([{ a: "a", b: "b", total: 20, aWins: 11, bWins: 9 }])).toEqual([]);
  });
  it("ignores pairs below the minimum duel count even if lopsided", () => {
    expect(flagDuelCollusion([{ a: "a", b: "b", total: 4, aWins: 4, bWins: 0 }])).toEqual([]);
  });
  it("names the winner as the account the chips flowed to", () => {
    const out = flagDuelCollusion([{ a: "a", b: "b", total: 10, aWins: 1, bWins: 9 }]);
    expect(out[0].winner).toBe("b");
  });
});

describe("flagGiftConcentration", () => {
  it("flags an account whose balance is mostly other people's gifts", () => {
    const out = flagGiftConcentration([{ userId: "collector", sent: 0, received: 5000, earnedTotal: 1000 }]);
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe("collector");
  });
  it("does NOT flag an active earner who also gets some gifts", () => {
    expect(flagGiftConcentration([{ userId: "active", sent: 0, received: 5000, earnedTotal: 100000 }])).toEqual([]);
  });
  it("ignores tiny gift totals below the floor", () => {
    expect(flagGiftConcentration([{ userId: "x", sent: 0, received: 500, earnedTotal: 10 }])).toEqual([]);
  });
});

describe("pairKey", () => {
  it("orders a pair canonically so A-vs-B and B-vs-A aggregate together", () => {
    expect(pairKey("z", "a")).toEqual(pairKey("a", "z"));
    expect(pairKey("z", "a")).toMatchObject({ a: "a", b: "z", key: "a|z" });
  });
});
