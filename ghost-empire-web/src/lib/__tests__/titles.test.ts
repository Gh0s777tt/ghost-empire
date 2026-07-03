import { describe, it, expect } from "vitest";
import { PROFILE_TITLES, titleById, isValidTitleId, parseOwnedTitles, TITLE_RARITY_COLOR, titleUnlocked } from "../titles";

describe("titleUnlocked (rank gate #788/B5)", () => {
  it("titles with no level req are always unlocked", () => {
    const rookie = titleById("rookie")!;
    expect(rookie.requiresLevel).toBeUndefined();
    expect(titleUnlocked(rookie, 1)).toBe(true);
  });
  it("gates a title behind its requiresLevel", () => {
    const eternal = titleById("eternal")!;
    expect(eternal.requiresLevel).toBe(60);
    expect(titleUnlocked(eternal, 59)).toBe(false);
    expect(titleUnlocked(eternal, 60)).toBe(true);
    expect(titleUnlocked(eternal, 100)).toBe(true);
  });
  it("level gates never decrease as titles get pricier (rank tracks cost)", () => {
    let prev = 0;
    for (const t of PROFILE_TITLES) {
      const req = t.requiresLevel ?? 0;
      expect(req).toBeGreaterThanOrEqual(prev);
      prev = req;
    }
  });
});

describe("PROFILE_TITLES catalog integrity", () => {
  it("has unique ids, positive ascending costs, and known rarities", () => {
    const ids = PROFILE_TITLES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length); // unique
    for (const t of PROFILE_TITLES) {
      expect(t.cost).toBeGreaterThan(0);
      expect(Number.isInteger(t.cost)).toBe(true);
      expect(TITLE_RARITY_COLOR[t.rarity]).toBeTruthy(); // rarity has a color
    }
    const costs = PROFILE_TITLES.map((t) => t.cost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs); // cheapest → priciest
  });
});

describe("titleById / isValidTitleId", () => {
  it("resolves real ids and rejects the rest", () => {
    expect(titleById("rookie")?.cost).toBe(500);
    expect(titleById("eternal")?.rarity).toBe("legendary");
    expect(titleById("nope")).toBeNull();
    expect(titleById(null)).toBeNull();
    expect(isValidTitleId("elite")).toBe(true);
    expect(isValidTitleId("elite ")).toBe(false);
    expect(isValidTitleId(42)).toBe(false);
  });
});

describe("parseOwnedTitles", () => {
  it("keeps only real ids, deduped; tolerates junk", () => {
    expect(parseOwnedTitles(["rookie", "elite", "rookie", "fake", 7, null])).toEqual(["rookie", "elite"]);
    expect(parseOwnedTitles(null)).toEqual([]);
    expect(parseOwnedTitles("rookie")).toEqual([]);
    expect(parseOwnedTitles([])).toEqual([]);
  });
});
