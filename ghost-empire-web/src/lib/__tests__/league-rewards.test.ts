import { describe, it, expect } from "vitest";
import { prizeForRank, previousMonthBounds, leagueAchievementCodes, LEAGUE_PRIZES } from "../league-rewards";

describe("prizeForRank", () => {
  it("pays the prize table for ranks 1..3, nothing beyond", () => {
    expect(prizeForRank(1)).toBe(LEAGUE_PRIZES[0]);
    expect(prizeForRank(2)).toBe(LEAGUE_PRIZES[1]);
    expect(prizeForRank(3)).toBe(LEAGUE_PRIZES[2]);
    expect(prizeForRank(4)).toBe(0);
    expect(prizeForRank(0)).toBe(0);
    expect(prizeForRank(-1)).toBe(0);
  });
});

describe("previousMonthBounds", () => {
  it("returns the calendar month before `now` (mid-year)", () => {
    const b = previousMonthBounds(new Date(Date.UTC(2026, 5, 15))); // June 2026 -> May
    expect(b.start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(b.number).toBe(5); // months since 2026-01 + 1 → May = 5
    expect(b.label).toBe("Maj 2026");
  });

  it("rolls over a year boundary", () => {
    const b = previousMonthBounds(new Date(Date.UTC(2026, 0, 10))); // Jan 2026 -> Dec 2025
    expect(b.start.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(b.label).toBe("Grudzień 2025");
  });

  it("uses the first instant of the month correctly (start of month -> previous)", () => {
    const b = previousMonthBounds(new Date(Date.UTC(2026, 6, 1, 0, 0, 0))); // Jul 1 -> June
    expect(b.label).toBe("Czerwiec 2026");
    expect(b.end.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("leagueAchievementCodes", () => {
  it("rank 1 earns both podium and winner", () => {
    expect(leagueAchievementCodes(1).sort()).toEqual(["league_podium", "league_winner"]);
  });
  it("ranks 2 and 3 earn podium only", () => {
    expect(leagueAchievementCodes(2)).toEqual(["league_podium"]);
    expect(leagueAchievementCodes(3)).toEqual(["league_podium"]);
  });
  it("rank 4+ and non-podium earn nothing", () => {
    expect(leagueAchievementCodes(4)).toEqual([]);
    expect(leagueAchievementCodes(0)).toEqual([]);
  });
});
