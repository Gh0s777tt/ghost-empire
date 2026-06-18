import { describe, it, expect } from "vitest";
import { normalizeClanTag, isValidClanTag, isValidClanName, isValidContribution, TAG_MAX } from "@/lib/clans";

describe("normalizeClanTag", () => {
  it("uppercases, strips non-alphanumerics, caps length", () => {
    expect(normalizeClanTag("gh0st")).toBe("GH0ST");
    expect(normalizeClanTag("g-h!o")).toBe("GHO");
    expect(normalizeClanTag("toolongtag")).toHaveLength(TAG_MAX);
    expect(normalizeClanTag("")).toBe("");
  });
});

describe("isValidClanTag", () => {
  it("accepts 2–5 uppercase alphanumerics, rejects the rest", () => {
    expect(isValidClanTag("GH0ST")).toBe(true);
    expect(isValidClanTag("AB")).toBe(true);
    expect(isValidClanTag("A")).toBe(false);
    expect(isValidClanTag("TOOLONG")).toBe(false);
    expect(isValidClanTag("gh0st")).toBe(false);
    expect(isValidClanTag("G-H")).toBe(false);
  });
});

describe("isValidClanName", () => {
  it("enforces trimmed length bounds", () => {
    expect(isValidClanName("Widma")).toBe(true);
    expect(isValidClanName("  ab ")).toBe(false);
    expect(isValidClanName("x".repeat(31))).toBe(false);
  });
});

describe("isValidContribution", () => {
  it("accepts whole amounts within bounds", () => {
    expect(isValidContribution(10)).toBe(true);
    expect(isValidContribution(1_000_000)).toBe(true);
    expect(isValidContribution(9)).toBe(false);
    expect(isValidContribution(1_000_001)).toBe(false);
    expect(isValidContribution(50.5)).toBe(false);
  });
});
