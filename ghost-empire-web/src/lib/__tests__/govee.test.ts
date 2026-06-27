import { describe, it, expect } from "vitest";
import { hexToRgb, goveeConfigured } from "../govee";

describe("hexToRgb", () => {
  it("parses a 6-hex color with or without a leading #", () => {
    expect(hexToRgb("#E50914")).toEqual({ r: 229, g: 9, b: 20 });
    expect(hexToRgb("e50914")).toEqual({ r: 229, g: 9, b: 20 });
    expect(hexToRgb("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("  #1A2B3C  ")).toEqual({ r: 26, g: 43, b: 60 });
  });

  it("returns null for malformed input", () => {
    expect(hexToRgb("#FFF")).toBeNull(); // 3-hex shorthand not supported
    expect(hexToRgb("red")).toBeNull();
    expect(hexToRgb("")).toBeNull();
    expect(hexToRgb("#GGGGGG")).toBeNull();
    expect(hexToRgb("#1234567")).toBeNull();
  });
});

describe("goveeConfigured", () => {
  it("is false without the required GOVEE_* env — dormant by default", () => {
    expect(goveeConfigured()).toBe(false);
  });
});
