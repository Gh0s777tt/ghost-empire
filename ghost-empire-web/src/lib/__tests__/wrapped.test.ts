import { describe, it, expect } from "vitest";
import { pickWrappedVibe, summarizeGtFlow } from "../wrapped";

describe("summarizeGtFlow", () => {
  it("extracts earned + abs(spent) from groupBy rows", () => {
    expect(summarizeGtFlow([
      { type: "earn", _sum: { amount: 5000 } },
      { type: "spend", _sum: { amount: -3000 } },
    ])).toEqual({ earned: 5000, spent: 3000 });
  });
  it("defaults missing types / null sums to 0", () => {
    expect(summarizeGtFlow([])).toEqual({ earned: 0, spent: 0 });
    expect(summarizeGtFlow([{ type: "earn", _sum: { amount: null } }])).toEqual({ earned: 0, spent: 0 });
  });
});

describe("pickWrappedVibe", () => {
  const base = { league: null, gt: { earned: 0, spent: 0 }, bounties: { created: 0, backed: 0, pledgedGt: 0 } };
  it("legend when league rank 1 with plays", () => {
    expect(pickWrappedVibe({ ...base, league: { rank: 1, net: 100, winRate: 0.5, plays: 5 } })).toBe("legend");
  });
  it("sharp when high win rate (>=0.6, >=3 plays) and not #1", () => {
    expect(pickWrappedVibe({ ...base, league: { rank: 4, net: 100, winRate: 0.7, plays: 10 } })).toBe("sharp");
  });
  it("profit when earned > spent", () => {
    expect(pickWrappedVibe({ ...base, gt: { earned: 5000, spent: 1000 } })).toBe("profit");
  });
  it("active when there is participation but not profit/sharp/legend", () => {
    expect(pickWrappedVibe({ ...base, bounties: { created: 1, backed: 0, pledgedGt: 100 } })).toBe("active");
  });
  it("newcomer when no activity at all", () => {
    expect(pickWrappedVibe(base)).toBe("newcomer");
  });
});
