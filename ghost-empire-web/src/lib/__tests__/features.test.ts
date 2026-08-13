// Unit tests for the pure feature-flag catalog + helpers (no DB, no React).
import { describe, it, expect } from "vitest";
import { FEATURES, FEATURE_KEYS, featureForHref, isFeatureEnabled, isHrefHidden } from "@/lib/features";

describe("FEATURES catalog", () => {
  it("has unique keys and unique hrefs (no accidental collisions in the toggle store)", () => {
    expect(new Set(FEATURES.map((f) => f.key)).size).toBe(FEATURES.length);
    expect(new Set(FEATURES.map((f) => f.href)).size).toBe(FEATURES.length);
  });
  it("every href is an absolute app path", () => {
    for (const f of FEATURES) expect(f.href.startsWith("/")).toBe(true);
  });
  it("FEATURE_KEYS mirrors the catalog (used to reject unknown keys in the API)", () => {
    expect(FEATURE_KEYS.size).toBe(FEATURES.length);
    expect(FEATURE_KEYS.has("shop")).toBe(true);
    expect(FEATURE_KEYS.has("not-a-feature")).toBe(false);
  });
});

describe("isFeatureEnabled (allow-by-default)", () => {
  it("is enabled when the key is NOT in the disabled list", () => {
    expect(isFeatureEnabled([], "shop")).toBe(true);
    expect(isFeatureEnabled(["wheel"], "shop")).toBe(true);
  });
  it("is disabled only when the key IS listed", () => {
    expect(isFeatureEnabled(["shop"], "shop")).toBe(false);
  });
  it("treats null/undefined (pre-migration / no data) as nothing-disabled", () => {
    expect(isFeatureEnabled(null, "shop")).toBe(true);
    expect(isFeatureEnabled(undefined, "casino")).toBe(true);
  });
});

describe("featureForHref / isHrefHidden (nav filtering)", () => {
  it("maps a known viewer route to its feature", () => {
    expect(featureForHref("/kasyno")?.key).toBe("casino");
    expect(featureForHref("/shop")?.key).toBe("shop");
  });
  it("returns undefined for a core route that isn't toggleable", () => {
    expect(featureForHref("/")).toBeUndefined();
    expect(featureForHref("/ranking")).toBeUndefined();
  });
  it("hides a nav href only when its feature is disabled", () => {
    expect(isHrefHidden(["casino"], "/kasyno")).toBe(true);
    expect(isHrefHidden([], "/kasyno")).toBe(false);
    expect(isHrefHidden(["casino"], "/shop")).toBe(false); // different feature
  });
  it("never hides a core (non-catalog) route regardless of the disabled list", () => {
    expect(isHrefHidden(["shop", "casino"], "/")).toBe(false);
    expect(isHrefHidden(["shop"], "/ranking")).toBe(false);
  });
});
