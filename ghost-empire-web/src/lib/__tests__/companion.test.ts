import { describe, it, expect } from "vitest";
import { companionStage, companionProgress, isValidFeed, FEED_MIN, FEED_MAX } from "@/lib/companion";

describe("companionStage", () => {
  it("returns the highest stage reached by the xp", () => {
    expect(companionStage(0).key).toBe("spark");
    expect(companionStage(499).key).toBe("spark");
    expect(companionStage(500).key).toBe("wisp");
    expect(companionStage(39999).key).toBe("wraith");
    expect(companionStage(40000).key).toBe("phantom");
    expect(companionStage(9_999_999).key).toBe("phantom");
  });
});

describe("companionProgress", () => {
  it("computes percentage toward the next stage", () => {
    const p = companionProgress(1250); // wisp [500..2000) → 750/1500 = 50%
    expect(p.stage.key).toBe("wisp");
    expect(p.next?.key).toBe("ghost");
    expect(p.pct).toBe(50);
    expect(p.toNext).toBe(750);
  });

  it("is 0% at the start of a stage", () => {
    expect(companionProgress(500).pct).toBe(0);
  });

  it("caps at the final stage with no next", () => {
    const p = companionProgress(50_000);
    expect(p.stage.key).toBe("phantom");
    expect(p.next).toBeNull();
    expect(p.pct).toBe(100);
    expect(p.toNext).toBe(0);
  });
});

describe("isValidFeed", () => {
  it("accepts whole amounts within bounds, rejects the rest", () => {
    expect(isValidFeed(FEED_MIN)).toBe(true);
    expect(isValidFeed(FEED_MAX)).toBe(true);
    expect(isValidFeed(1000)).toBe(true);
    expect(isValidFeed(FEED_MIN - 1)).toBe(false);
    expect(isValidFeed(FEED_MAX + 1)).toBe(false);
    expect(isValidFeed(100.5)).toBe(false);
    expect(isValidFeed(-50)).toBe(false);
  });
});
