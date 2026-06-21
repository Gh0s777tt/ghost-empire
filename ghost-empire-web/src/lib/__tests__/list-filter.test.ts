import { describe, it, expect } from "vitest";
import { normalizeForSearch, matchesQuery, filterByText } from "@/lib/list-filter";

describe("normalizeForSearch", () => {
  it("lowercases, trims and strips diacritics", () => {
    expect(normalizeForSearch("  Żółw  ")).toBe("zolw");
    // Ł/ł has no NFD-combining form, so it's folded explicitly to 'l'.
    expect(normalizeForSearch("ŁÓDŹ")).toBe("lodz");
  });
  it("maps common Polish accents (incl. ł) to ASCII", () => {
    expect(normalizeForSearch("ąćęłńóśźż")).toBe("acelnoszz");
  });
});

describe("matchesQuery", () => {
  it("empty query matches everything", () => {
    expect(matchesQuery(["whatever"], "")).toBe(true);
    expect(matchesQuery([null, undefined], "   ")).toBe(true);
  });
  it("is diacritic- and case-insensitive", () => {
    expect(matchesQuery(["Żółw Master"], "zolw")).toBe(true);
    expect(matchesQuery(["Żółw Master"], "MASTER")).toBe(true);
  });
  it("requires ALL tokens (AND) — extra words narrow", () => {
    expect(matchesQuery(["Epic Skull Card"], "skull card")).toBe(true);
    expect(matchesQuery(["Epic Skull Card"], "skull dragon")).toBe(false);
  });
  it("searches across all parts, ignoring null/undefined", () => {
    expect(matchesQuery(["First Blood", null, "rare", undefined], "rare blood")).toBe(true);
    expect(matchesQuery(["First Blood", "common"], "legendary")).toBe(false);
  });
});

describe("filterByText", () => {
  const items = [
    { name: "Skull Card", cat: "cosmetic" },
    { name: "GTA V Key", cat: "games" },
    { name: "Złoty Bilet", cat: "experience" },
  ];
  const parts = (i: (typeof items)[number]) => [i.name, i.cat];

  it("returns the original list for an empty query (no copy needed semantics aside)", () => {
    expect(filterByText(items, "", parts)).toHaveLength(3);
    expect(filterByText(items, "   ", parts)).toHaveLength(3);
  });
  it("filters by name or category", () => {
    expect(filterByText(items, "games", parts).map((i) => i.name)).toEqual(["GTA V Key"]);
    expect(filterByText(items, "skull", parts)).toHaveLength(1);
  });
  it("matches accented entries when typing ASCII", () => {
    expect(filterByText(items, "zloty bilet", parts).map((i) => i.name)).toEqual(["Złoty Bilet"]);
  });
  it("returns empty when nothing matches", () => {
    expect(filterByText(items, "nonexistent", parts)).toHaveLength(0);
  });
});
