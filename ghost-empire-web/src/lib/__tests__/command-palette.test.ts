import { describe, it, expect } from "vitest";
import { COMMANDS, scoreCommand, filterCommands } from "@/lib/command-palette";

describe("scoreCommand", () => {
  it("ranks prefix > word-start > substring > subsequence > none", () => {
    const prefix = scoreCommand("shop sklep", "shop");
    const wordStart = scoreCommand("buy at shop", "shop");
    const mid = scoreCommand("preshop", "shop");
    const subseq = scoreCommand("super hot pasta", "shp");
    const none = scoreCommand("ranking", "zzz");
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(subseq);
    expect(subseq).toBeGreaterThan(none);
    expect(none).toBe(0);
  });
  it("empty query matches everything at a base score", () => {
    expect(scoreCommand("anything", "")).toBe(1);
    expect(scoreCommand("anything", "   ")).toBe(1);
  });
});

describe("filterCommands", () => {
  const items = [
    { search: "ranking leaderboard", id: "ranking" },
    { search: "shop sklep buy", id: "shop" },
    { search: "achievements odznaki", id: "ach" },
  ];
  it("returns only matches, best first", () => {
    const r = filterCommands(items, "sklep");
    expect(r.map((x) => x.id)).toEqual(["shop"]);
  });
  it("empty query keeps original order", () => {
    expect(filterCommands(items, "").map((x) => x.id)).toEqual(["ranking", "shop", "ach"]);
  });
  it("no match → empty", () => {
    expect(filterCommands(items, "zzzzz")).toEqual([]);
  });
});

describe("COMMANDS index", () => {
  it("has unique ids and hrefs", () => {
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length);
    expect(new Set(COMMANDS.map((c) => c.href)).size).toBe(COMMANDS.length);
  });
  it("every href is absolute (starts with /)", () => {
    for (const c of COMMANDS) expect(c.href.startsWith("/")).toBe(true);
  });
});
