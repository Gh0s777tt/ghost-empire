import { describe, it, expect } from "vitest";
import { PROFILE_ACCENTS, isAccentKey, accentColor } from "@/lib/profile-accents";

describe("profile-accents", () => {
  it("every preset resolves to its hex via accentColor", () => {
    for (const a of PROFILE_ACCENTS) expect(accentColor(a.key)).toBe(a.color);
  });

  it("isAccentKey accepts known keys, rejects others", () => {
    expect(isAccentKey("violet")).toBe(true);
    expect(isAccentKey("emerald")).toBe(true);
    expect(isAccentKey("rainbow")).toBe(false);
    expect(isAccentKey("")).toBe(false);
  });

  it("accentColor falls back to null for unknown / empty / null", () => {
    expect(accentColor("rainbow")).toBeNull();
    expect(accentColor("")).toBeNull();
    expect(accentColor(null)).toBeNull();
    expect(accentColor(undefined)).toBeNull();
  });

  it("keys are unique", () => {
    const keys = PROFILE_ACCENTS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
