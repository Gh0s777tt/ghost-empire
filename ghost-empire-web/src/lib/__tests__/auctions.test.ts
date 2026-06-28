// src/lib/__tests__/auctions.test.ts
import { describe, it, expect } from "vitest";
import {
  nextMinBid,
  isAuctionLive,
  displayStatus,
  validateAuctionInput,
  bidError,
  AUCTION_MIN_BID_FLOOR,
  AUCTION_MIN_DURATION_MS,
  AUCTION_MAX_DURATION_MS,
  AUCTION_TITLE_MAX,
  AUCTION_DESC_MAX,
  AUCTION_MAX_BID,
} from "@/lib/auctions";

const NOW = 1_700_000_000_000;

describe("nextMinBid", () => {
  it("returns the floor when there are no bids yet", () => {
    expect(nextMinBid(100, null)).toBe(100);
    expect(nextMinBid(500, undefined)).toBe(500);
  });
  it("applies the minimum flat increment for small current bids", () => {
    // 5% of 100 = 5, but the floor increment is 10
    expect(nextMinBid(100, 100)).toBe(110);
  });
  it("applies the percentage increment for large current bids", () => {
    // 5% of 1000 = 50 (> 10 floor)
    expect(nextMinBid(100, 1000)).toBe(1050);
    expect(nextMinBid(100, 10_000)).toBe(10_500);
  });
  it("rounds the percentage step up", () => {
    // 5% of 101 = 5.05 -> ceil 6, still below the flat floor of 10
    expect(nextMinBid(50, 101)).toBe(111);
    // 5% of 333 = 16.65 -> ceil 17
    expect(nextMinBid(50, 333)).toBe(350);
  });
});

describe("isAuctionLive", () => {
  it("is live only when open and before the end time", () => {
    expect(isAuctionLive({ status: "open", endsAt: NOW + 1000 }, NOW)).toBe(true);
  });
  it("is not live once past the end time", () => {
    expect(isAuctionLive({ status: "open", endsAt: NOW - 1 }, NOW)).toBe(false);
    expect(isAuctionLive({ status: "open", endsAt: NOW }, NOW)).toBe(false);
  });
  it("is not live when closed or cancelled regardless of time", () => {
    expect(isAuctionLive({ status: "closed", endsAt: NOW + 9999 }, NOW)).toBe(false);
    expect(isAuctionLive({ status: "cancelled", endsAt: NOW + 9999 }, NOW)).toBe(false);
  });
  it("accepts Date and ISO-string end times", () => {
    expect(isAuctionLive({ status: "open", endsAt: new Date(NOW + 5000) }, NOW)).toBe(true);
    expect(isAuctionLive({ status: "open", endsAt: new Date(NOW + 5000).toISOString() }, NOW)).toBe(true);
  });
});

describe("displayStatus", () => {
  it("reports live for an open, future auction", () => {
    expect(displayStatus({ status: "open", endsAt: NOW + 1000 }, NOW)).toBe("live");
  });
  it("collapses a past-end open row to ended (before lazy settlement)", () => {
    expect(displayStatus({ status: "open", endsAt: NOW - 1 }, NOW)).toBe("ended");
  });
  it("reports ended for a closed row", () => {
    expect(displayStatus({ status: "closed", endsAt: NOW + 9999 }, NOW)).toBe("ended");
  });
  it("reports cancelled (even if somehow still in the future)", () => {
    expect(displayStatus({ status: "cancelled", endsAt: NOW + 9999 }, NOW)).toBe("cancelled");
  });
});

describe("validateAuctionInput", () => {
  const base = { title: "VIP for a week", description: "spend it well", minBid: 1000, durationMs: AUCTION_MIN_DURATION_MS * 2 };
  it("accepts a well-formed input", () => {
    expect(validateAuctionInput(base)).toEqual({ ok: true });
  });
  it("accepts a valid https image url and an empty one", () => {
    expect(validateAuctionInput({ ...base, imageUrl: "https://cdn.example.com/x.png" })).toEqual({ ok: true });
    expect(validateAuctionInput({ ...base, imageUrl: "" })).toEqual({ ok: true });
  });
  it("rejects a too-short or too-long title", () => {
    expect(validateAuctionInput({ ...base, title: "ab" })).toEqual({ ok: false, error: "title" });
    expect(validateAuctionInput({ ...base, title: "x".repeat(AUCTION_TITLE_MAX + 1) })).toEqual({ ok: false, error: "title" });
  });
  it("rejects an over-long description", () => {
    expect(validateAuctionInput({ ...base, description: "y".repeat(AUCTION_DESC_MAX + 1) })).toEqual({ ok: false, error: "description" });
  });
  it("rejects a non-http(s) image url", () => {
    expect(validateAuctionInput({ ...base, imageUrl: "javascript:alert(1)" })).toEqual({ ok: false, error: "imageUrl" });
  });
  it("rejects a minBid below the floor, non-integer, or above the ceiling", () => {
    expect(validateAuctionInput({ ...base, minBid: AUCTION_MIN_BID_FLOOR - 1 })).toEqual({ ok: false, error: "minBid" });
    expect(validateAuctionInput({ ...base, minBid: 10.5 })).toEqual({ ok: false, error: "minBid" });
    expect(validateAuctionInput({ ...base, minBid: AUCTION_MAX_BID + 1 })).toEqual({ ok: false, error: "minBid" });
  });
  it("rejects a duration outside the allowed window", () => {
    expect(validateAuctionInput({ ...base, durationMs: AUCTION_MIN_DURATION_MS - 1 })).toEqual({ ok: false, error: "duration" });
    expect(validateAuctionInput({ ...base, durationMs: AUCTION_MAX_DURATION_MS + 1 })).toEqual({ ok: false, error: "duration" });
  });
});

describe("bidError", () => {
  it("passes a valid bid (>= minNext and <= balance)", () => {
    expect(bidError(150, 110, 1000)).toBeNull();
  });
  it("rejects a bid below the minimum next bid", () => {
    expect(bidError(100, 110, 1000)).toBe("min");
  });
  it("rejects a bid above the bidder balance", () => {
    expect(bidError(2000, 110, 1000)).toBe("poor");
  });
  it("rejects a non-integer, zero, negative, or absurd amount", () => {
    expect(bidError(10.5, 10, 1000)).toBe("amount");
    expect(bidError(0, 10, 1000)).toBe("amount");
    expect(bidError(-5, 10, 1000)).toBe("amount");
    expect(bidError(AUCTION_MAX_BID + 1, 10, AUCTION_MAX_BID * 2)).toBe("amount");
  });
});
