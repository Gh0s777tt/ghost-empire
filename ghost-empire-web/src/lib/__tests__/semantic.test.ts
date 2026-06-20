import { describe, it, expect } from "vitest";
import { cosineSim, rankBySimilarity } from "@/lib/semantic";

describe("cosineSim", () => {
  it("is 1 for identical, -1 for opposite, 0 for orthogonal", () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSim([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is scale-invariant", () => {
    expect(cosineSim([1, 1], [3, 3])).toBeCloseTo(1);
  });
  it("returns 0 for empty or zero vectors", () => {
    expect(cosineSim([], [1, 2])).toBe(0);
    expect(cosineSim([0, 0], [1, 1])).toBe(0);
  });
});

describe("rankBySimilarity", () => {
  it("orders by closeness to the query and strips the vec", () => {
    const items = [
      { id: "far", vec: [0, 1] },
      { id: "near", vec: [1, 0.1] },
      { id: "mid", vec: [1, 1] },
    ];
    const ranked = rankBySimilarity([1, 0], items, 2);
    expect(ranked.map((r) => r.id)).toEqual(["near", "mid"]);
    expect(ranked[0]).not.toHaveProperty("vec");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});
