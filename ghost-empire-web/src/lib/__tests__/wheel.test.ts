import { describe, it, expect } from "vitest";
import { parseSegments, DEFAULT_SEGMENTS } from "@/lib/wheel";

describe("parseSegments", () => {
  it("falls back to DEFAULT_SEGMENTS for non-array input", () => {
    expect(parseSegments(null)).toBe(DEFAULT_SEGMENTS);
    expect(parseSegments(undefined)).toBe(DEFAULT_SEGMENTS);
    expect(parseSegments("nope")).toBe(DEFAULT_SEGMENTS);
    expect(parseSegments({})).toBe(DEFAULT_SEGMENTS);
    expect(parseSegments(42)).toBe(DEFAULT_SEGMENTS);
  });

  it("falls back when fewer than 2 valid segments survive", () => {
    expect(parseSegments([])).toBe(DEFAULT_SEGMENTS);
    // one valid segment is not enough to make a wheel
    expect(parseSegments([{ label: "A", weight: 1 }])).toBe(DEFAULT_SEGMENTS);
  });

  it("keeps valid segments and coerces missing reward/color to safe defaults", () => {
    const out = parseSegments([
      { label: "A", weight: 2 },
      { label: "B", weight: 3 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ label: "A", weight: 2, rewardTokens: 0, color: "#6366f1" });
    expect(out[1]).toEqual({ label: "B", weight: 3, rewardTokens: 0, color: "#6366f1" });
    // a real parse never returns the shared DEFAULT_SEGMENTS reference
    expect(out).not.toBe(DEFAULT_SEGMENTS);
  });

  it("drops items with no label or non-positive weight", () => {
    const out = parseSegments([
      { label: "keep", weight: 1 },
      { label: "", weight: 5 }, // empty label → dropped
      { label: "zero", weight: 0 }, // weight 0 → dropped
      { label: "neg", weight: -3 }, // negative weight → floored to 0 → dropped
      { label: "alsoKeep", weight: 2 },
    ]);
    expect(out.map((s) => s.label)).toEqual(["keep", "alsoKeep"]);
  });

  it("skips non-object entries", () => {
    const out = parseSegments([
      null,
      "string",
      7,
      { label: "ok1", weight: 1 },
      { label: "ok2", weight: 1 },
    ]);
    expect(out.map((s) => s.label)).toEqual(["ok1", "ok2"]);
  });

  it("trims the label and caps it at 40 chars", () => {
    const long = "x".repeat(60);
    const out = parseSegments([
      { label: `  spaced  `, weight: 1 },
      { label: long, weight: 1 },
    ]);
    expect(out[0].label).toBe("spaced");
    expect(out[1].label).toHaveLength(40);
  });

  it("floors weight and clamps rewardTokens to [0, 1_000_000]", () => {
    const out = parseSegments([
      { label: "A", weight: 2.9, rewardTokens: 50.7 },
      { label: "B", weight: 1, rewardTokens: 5_000_000 },
      { label: "C", weight: 1, rewardTokens: -100 },
    ]);
    expect(out[0].weight).toBe(2);
    expect(out[0].rewardTokens).toBe(50);
    expect(out[1].rewardTokens).toBe(1_000_000);
    expect(out[2].rewardTokens).toBe(0);
  });

  it("accepts valid hex colors and falls back on invalid ones", () => {
    const out = parseSegments([
      { label: "A", weight: 1, color: "#abc" },
      { label: "B", weight: 1, color: "#AABBCCDD" },
      { label: "C", weight: 1, color: "red" }, // not hex → fallback
      { label: "D", weight: 1, color: 123 }, // not a string → fallback
    ]);
    expect(out[0].color).toBe("#abc");
    expect(out[1].color).toBe("#AABBCCDD");
    expect(out[2].color).toBe("#6366f1");
    expect(out[3].color).toBe("#6366f1");
  });

  it("caps the output at 12 segments", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `S${i}`, weight: 1 }));
    const out = parseSegments(many);
    expect(out).toHaveLength(12);
    expect(out[0].label).toBe("S0");
    expect(out[11].label).toBe("S11");
  });
});
