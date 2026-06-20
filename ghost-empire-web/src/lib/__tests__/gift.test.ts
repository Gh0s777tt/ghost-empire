import { describe, it, expect } from "vitest";
import { clampGift, giftError, GIFT_MAX_PER_TX, GIFT_DAILY_LIMIT } from "@/lib/gift";

describe("clampGift", () => {
  it("floors and clamps to [0, MAX_PER_TX]", () => {
    expect(clampGift(0)).toBe(0);
    expect(clampGift(-10)).toBe(0);
    expect(clampGift(12.9)).toBe(12);
    expect(clampGift(GIFT_MAX_PER_TX + 1000)).toBe(GIFT_MAX_PER_TX);
    expect(clampGift(NaN)).toBe(0);
  });
});

describe("giftError", () => {
  it("rejects out-of-range amounts", () => {
    expect(giftError(0, 1000, 0)).toBe("amount");
    expect(giftError(GIFT_MAX_PER_TX + 1, 999999, 0)).toBe("amount");
    expect(giftError(NaN, 1000, 0)).toBe("amount");
  });
  it("rejects when balance is too low", () => {
    expect(giftError(500, 100, 0)).toBe("insufficient");
  });
  it("rejects when the daily limit would be exceeded", () => {
    expect(giftError(2000, 999999, GIFT_DAILY_LIMIT - 1000)).toBe("daily");
  });
  it("allows a valid gift", () => {
    expect(giftError(500, 1000, 0)).toBeNull();
    expect(giftError(1000, 1000, GIFT_DAILY_LIMIT - 1000)).toBeNull();
  });
});
