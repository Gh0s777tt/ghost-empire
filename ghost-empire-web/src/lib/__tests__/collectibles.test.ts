import { describe, it, expect } from "vitest";
import { RARITIES, RARITY_WEIGHT, isRarity, normalizeRarity, pickRarity } from "@/lib/collectibles";

describe("rarity helpers", () => {
  it("weights sum to 100", () => {
    expect(RARITIES.reduce((s, r) => s + RARITY_WEIGHT[r], 0)).toBe(100);
  });
  it("isRarity / normalizeRarity", () => {
    expect(isRarity("epic")).toBe(true);
    expect(isRarity("mythic")).toBe(false);
    expect(normalizeRarity("legendary")).toBe("legendary");
    expect(normalizeRarity("nope")).toBe("common");
    expect(normalizeRarity(null)).toBe("common");
  });
});

describe("pickRarity", () => {
  // bands: common 0–60, rare 60–88, epic 88–98, legendary 98–100
  it("maps the band boundaries", () => {
    expect(pickRarity(0)).toBe("common");
    expect(pickRarity(0.59)).toBe("common");
    expect(pickRarity(0.6)).toBe("rare");
    expect(pickRarity(0.87)).toBe("rare");
    expect(pickRarity(0.88)).toBe("epic");
    expect(pickRarity(0.97)).toBe("epic");
    expect(pickRarity(0.98)).toBe("legendary");
    expect(pickRarity(0.9999)).toBe("legendary");
  });
  it("clamps out-of-range input", () => {
    expect(pickRarity(-1)).toBe("common");
    expect(pickRarity(2)).toBe("legendary");
  });
  it("roughly matches the weights over many samples", () => {
    const counts: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const N = 4000;
    for (let i = 0; i < N; i++) counts[pickRarity((i + 0.5) / N)]++;
    // deterministic sweep → exact proportions
    expect(counts.common).toBe(2400); // 60%
    expect(counts.rare).toBe(1120); // 28%
    expect(counts.epic).toBe(400); // 10%
    expect(counts.legendary).toBe(80); // 2%
  });
});
