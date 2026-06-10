import { describe, it, expect } from "vitest";
import { handValue, isBlackjack, dealerPlay, settleMultiplier, cardLabel } from "@/lib/gt-blackjack";

// rank helpers: A=0, 2=1 … 10=9, J=10, Q=11, K=12 (suit = +13 per step)
const A = 0, TWO = 1, FIVE = 4, SIX = 5, NINE = 8, TEN = 9, J = 10, K = 12;

describe("blackjack hand value", () => {
  it("counts aces as 11 when they fit, 1 otherwise", () => {
    expect(handValue([A, K]).total).toBe(21);            // A+K = blackjack
    expect(handValue([A, A]).total).toBe(12);            // 11+1
    expect(handValue([A, NINE, K]).total).toBe(20);      // 1+9+10
    expect(handValue([A, A, A, K]).total).toBe(13);      // 1+1+1+10
  });
  it("face cards are 10", () => {
    expect(handValue([J, K]).total).toBe(20);
    expect(handValue([TEN, J, K]).total).toBe(30);
  });
});

describe("blackjack rules", () => {
  it("detects naturals only on two cards", () => {
    expect(isBlackjack([A, K])).toBe(true);
    expect(isBlackjack([A, FIVE, FIVE])).toBe(false); // 21 in 3 cards ≠ blackjack
  });
  it("dealer draws to 17 and stands", () => {
    const final = dealerPlay([TEN, SIX], [FIVE, TWO]); // 16 → draws 2 → 18, stands
    expect(handValue(final).total).toBeGreaterThanOrEqual(17);
    expect(final).toHaveLength(3);
    expect(dealerPlay([TEN, NINE], [FIVE])).toHaveLength(2); // 19 stands immediately
  });
  it("settles: bj 2.5 / win 2 / push 1 / lose-bust 0", () => {
    expect(settleMultiplier([A, K], [TEN, NINE])).toBe(2.5);          // natural beats 19
    expect(settleMultiplier([A, K], [A, J])).toBe(1);                 // both naturals = push
    expect(settleMultiplier([TEN, NINE], [TEN, SIX, FIVE])).toBe(0);  // 19 vs dealer 21
    expect(settleMultiplier([TEN, NINE], [TEN, SIX, K])).toBe(2);     // dealer busts (26)
    expect(settleMultiplier([TEN, FIVE, K], [TEN, NINE])).toBe(0);    // player bust (25)
    expect(settleMultiplier([TEN, NINE], [TEN, NINE])).toBe(1);       // push 19/19
  });
  it("labels cards", () => {
    expect(cardLabel(0)).toBe("♠A");
    expect(cardLabel(13 + 12)).toBe("♥K");
  });
});
