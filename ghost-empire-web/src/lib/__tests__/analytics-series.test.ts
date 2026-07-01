// src/lib/__tests__/analytics-series.test.ts
import { describe, it, expect } from "vitest";
import {
  dayKey,
  dayKeys,
  weekStart,
  weekKeys,
  fillSeries,
  linePath,
  areaPath,
  buildCohortGrid,
} from "@/lib/analytics-series";

// Wed 2026-06-17 12:00 UTC
const NOW = Date.UTC(2026, 5, 17, 12, 0, 0);

describe("dayKeys", () => {
  it("returns the last N days oldest→newest ending today (UTC)", () => {
    const keys = dayKeys(3, NOW);
    expect(keys).toEqual(["2026-06-15", "2026-06-16", "2026-06-17"]);
  });
  it("crosses month boundaries", () => {
    const keys = dayKeys(3, Date.UTC(2026, 6, 1));
    expect(keys).toEqual(["2026-06-29", "2026-06-30", "2026-07-01"]);
  });
});

describe("weekStart / weekKeys", () => {
  it("anchors to Monday like Postgres date_trunc('week')", () => {
    expect(dayKey(weekStart(NOW))).toBe("2026-06-15"); // Mon of that week
    expect(dayKey(weekStart(Date.UTC(2026, 5, 15)))).toBe("2026-06-15"); // Monday itself
    expect(dayKey(weekStart(Date.UTC(2026, 5, 21)))).toBe("2026-06-15"); // Sunday → same Mon
  });
  it("returns the last N week starts ending this week", () => {
    expect(weekKeys(3, NOW)).toEqual(["2026-06-01", "2026-06-08", "2026-06-15"]);
  });
});

describe("fillSeries", () => {
  it("fills gaps with zero and preserves axis order", () => {
    const axis = ["2026-06-15", "2026-06-16", "2026-06-17"];
    expect(fillSeries(axis, { "2026-06-16": 5 })).toEqual([0, 5, 0]);
  });
  it("clamps negatives and rounds", () => {
    const axis = ["a", "b"];
    expect(fillSeries(axis, { a: -3, b: 2.6 })).toEqual([0, 3]);
  });
});

describe("linePath / areaPath", () => {
  it("scales values into the box with max at the top", () => {
    expect(linePath([0, 10], 100, 50)).toBe("M0 50 L100 0");
  });
  it("draws a flat zero series along the bottom", () => {
    expect(linePath([0, 0, 0], 90, 30)).toBe("M0 30 L45 30 L90 30");
  });
  it("handles a single point and empty input", () => {
    expect(linePath([5], 100, 50)).toBe("M0 0");
    expect(linePath([], 100, 50)).toBe("");
    expect(areaPath([], 100, 50)).toBe("");
  });
  it("closes the area down to the baseline", () => {
    expect(areaPath([0, 10], 100, 50)).toBe("M0 50 L100 0 L100 50 L0 50 Z");
  });
});

describe("buildCohortGrid", () => {
  const weeks = 3;
  it("builds rows per cohort with week-0 anchored at signup", () => {
    const sizes = [
      { cohort: "2026-06-01", size: 10 },
      { cohort: "2026-06-15", size: 4 },
    ];
    const activity = [
      { cohort: "2026-06-01", week: "2026-06-01", users: 10 },
      { cohort: "2026-06-01", week: "2026-06-08", users: 4 },
      { cohort: "2026-06-01", week: "2026-06-15", users: 2 },
      { cohort: "2026-06-15", week: "2026-06-15", users: 4 },
    ];
    const grid = buildCohortGrid(sizes, activity, weeks, NOW);
    expect(grid).toHaveLength(2);
    const [old, fresh] = grid;
    expect(old.cohort).toBe("2026-06-01");
    expect(old.cells[0]).toEqual({ users: 10, pct: 100 });
    expect(old.cells[1]).toEqual({ users: 4, pct: 40 });
    expect(old.cells[2]).toEqual({ users: 2, pct: 20 });
    // fresh cohort: only week 0 exists so far; the future is null-padded
    expect(fresh.cells[0]).toEqual({ users: 4, pct: 100 });
    expect(fresh.cells[1]).toBeNull();
  });
  it("drops empty cohorts and caps pct at 100", () => {
    const grid = buildCohortGrid(
      [{ cohort: "2026-06-15", size: 2 }, { cohort: "2026-06-08", size: 0 }],
      [{ cohort: "2026-06-15", week: "2026-06-15", users: 5 }],
      weeks,
      NOW,
    );
    expect(grid).toHaveLength(1);
    expect(grid[0].cells[0]).toEqual({ users: 5, pct: 100 });
  });
});
