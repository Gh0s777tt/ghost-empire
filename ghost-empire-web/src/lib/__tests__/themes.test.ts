import { describe, it, expect } from "vitest";
import { normalizeTheme, THEMES, DEFAULT_THEME } from "@/lib/themes";

describe("normalizeTheme", () => {
  it("passes through every known theme", () => {
    for (const t of THEMES) expect(normalizeTheme(t)).toBe(t);
  });
  it("falls back to the default for unknown / empty values", () => {
    expect(normalizeTheme("neon")).toBe(DEFAULT_THEME);
    expect(normalizeTheme("")).toBe(DEFAULT_THEME);
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
    expect(normalizeTheme(undefined)).toBe(DEFAULT_THEME);
  });
  it("defaults to dark", () => {
    expect(DEFAULT_THEME).toBe("dark");
  });
});
