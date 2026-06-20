import { describe, it, expect } from "vitest";
import { clampPrice, marketFee, sellerProceeds, MARKET_MIN_PRICE, MARKET_MAX_PRICE } from "@/lib/market";

describe("clampPrice", () => {
  it("floors and clamps to [min,max]", () => {
    expect(clampPrice(0)).toBe(MARKET_MIN_PRICE);
    expect(clampPrice(-50)).toBe(MARKET_MIN_PRICE);
    expect(clampPrice(10.9)).toBe(10);
    expect(clampPrice(9_999_999)).toBe(MARKET_MAX_PRICE);
    expect(clampPrice(NaN)).toBe(MARKET_MIN_PRICE);
  });
});

describe("fee + proceeds", () => {
  it("burns 5% (ceil) and the seller gets the rest", () => {
    expect(marketFee(100)).toBe(5);
    expect(sellerProceeds(100)).toBe(95);
    expect(marketFee(1)).toBe(1); // ceil → never zero on a priced sale
    expect(sellerProceeds(1)).toBe(0);
    expect(marketFee(1000)).toBe(50);
    expect(sellerProceeds(1000)).toBe(950);
  });
  it("fee + proceeds always equals price", () => {
    for (const p of [1, 7, 50, 199, 1000, 12345]) expect(marketFee(p) + sellerProceeds(p)).toBe(p);
  });
});
