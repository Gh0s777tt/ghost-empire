import { describe, it, expect } from "vitest";
import { normalizeUsernameForDedup } from "../user-merge";

describe("normalizeUsernameForDedup", () => {
  it("strips non-alphanumeric and lowercases", () => {
    expect(normalizeUsernameForDedup("_Gh0s77tt")).toBe("gh0s77tt");
    expect(normalizeUsernameForDedup("gh0s77tt")).toBe("gh0s77tt");
    expect(normalizeUsernameForDedup("GH0S77TT")).toBe("gh0s77tt");
  });
  it("treats underscore/dot/dash variants of the same handle as equal", () => {
    const a = normalizeUsernameForDedup("john.doe");
    const b = normalizeUsernameForDedup("john_doe");
    const c = normalizeUsernameForDedup("JohnDoe");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
  it("returns empty when nothing alphanumeric remains, and handles null", () => {
    expect(normalizeUsernameForDedup("___")).toBe("");
    expect(normalizeUsernameForDedup(null)).toBe("");
    expect(normalizeUsernameForDedup(undefined)).toBe("");
  });
});
