import { describe, it, expect } from "vitest";
import { rankRows, summarizePredictor, type LeagueRow } from "../prediction-leagues";

const mk = (userId: string, p: Partial<LeagueRow> = {}): LeagueRow => ({
  userId, plays: 0, wins: 0, net: 0, wagered: 0, biggestWin: 0, ...p,
});

describe("rankRows", () => {
  it("ranks by net descending and assigns 1-based rank", () => {
    const out = rankRows([
      mk("a", { net: 100, plays: 2, wins: 1 }),
      mk("b", { net: 500, plays: 3, wins: 3 }),
      mk("c", { net: -50, plays: 1, wins: 0 }),
    ]);
    expect(out.map((r) => r.userId)).toEqual(["b", "a", "c"]);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("computes winRate = wins/plays (0 when no plays)", () => {
    const out = rankRows([mk("a", { plays: 4, wins: 1, net: 10 }), mk("z", { plays: 0, wins: 0 })]);
    const a = out.find((r) => r.userId === "a")!;
    const z = out.find((r) => r.userId === "z")!;
    expect(a.winRate).toBe(0.25);
    expect(z.winRate).toBe(0);
  });

  it("breaks net ties by wins, then wagered, then userId (deterministic)", () => {
    const out = rankRows([
      mk("low", { net: 100, wins: 1, wagered: 100 }),
      mk("hi", { net: 100, wins: 3, wagered: 100 }),
      mk("mid", { net: 100, wins: 1, wagered: 999 }),
    ]);
    expect(out.map((r) => r.userId)).toEqual(["hi", "mid", "low"]);
  });

  it("does not mutate the input array", () => {
    const input = [mk("a", { net: 1 }), mk("b", { net: 2 })];
    const before = input.map((r) => r.userId).join(",");
    rankRows(input);
    expect(input.map((r) => r.userId).join(",")).toBe(before);
  });
});

describe("summarizePredictor", () => {
  it("returns null for no row, null, or zero plays (card hides)", () => {
    expect(summarizePredictor(undefined)).toBeNull();
    expect(summarizePredictor(null)).toBeNull();
    expect(summarizePredictor({ plays: 0, wins: 0, net: 0, wagered: 0, biggestwin: 0 })).toBeNull();
  });

  it("maps a raw aggregate (biggestwin → biggestWin) and derives winRate", () => {
    expect(summarizePredictor({ plays: 8, wins: 6, net: 1200, wagered: 4000, biggestwin: 800 })).toEqual({
      plays: 8,
      wins: 6,
      net: 1200,
      wagered: 4000,
      biggestWin: 800,
      winRate: 0.75,
    });
  });

  it("keeps a negative net (a losing predictor still has a record)", () => {
    const r = summarizePredictor({ plays: 3, wins: 0, net: -150, wagered: 150, biggestwin: 0 });
    expect(r).toMatchObject({ net: -150, wins: 0, winRate: 0 });
  });
});
