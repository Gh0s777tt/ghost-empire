import { describe, it, expect } from "vitest";
import { BG_PRESETS, bgPresetValue, isBgPreset, bgPresetId, resolveBgPresetCss } from "@/lib/bg-presets";

describe("bg-presets", () => {
  it("every preset has a unique id, a label and a non-empty css", () => {
    const ids = new Set<string>();
    for (const p of BG_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.css.length).toBeGreaterThan(0);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
    }
  });

  it("bgPresetValue round-trips through the helpers", () => {
    const v = bgPresetValue("nebula");
    expect(v).toBe("preset:nebula");
    expect(isBgPreset(v)).toBe(true);
    expect(bgPresetId(v)).toBe("nebula");
    expect(resolveBgPresetCss(v)).toBe(BG_PRESETS[0].css);
  });

  it("rejects unknown presets and non-preset values", () => {
    expect(isBgPreset("preset:does-not-exist")).toBe(false);
    expect(isBgPreset("https://example.com/bg.jpg")).toBe(false);
    expect(isBgPreset(null)).toBe(false);
    expect(isBgPreset(undefined)).toBe(false);
    expect(isBgPreset("")).toBe(false);
    expect(bgPresetId("https://x/y.png")).toBeNull();
    expect(resolveBgPresetCss("preset:nope")).toBeNull();
    expect(resolveBgPresetCss("https://x/y.png")).toBeNull();
  });

  it("does not treat a bare 'preset:' or a real URL as a preset", () => {
    expect(isBgPreset("preset:")).toBe(false);
    expect(resolveBgPresetCss("preset:")).toBeNull();
  });
});
