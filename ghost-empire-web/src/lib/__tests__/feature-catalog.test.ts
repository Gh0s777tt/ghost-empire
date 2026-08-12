// src/lib/__tests__/feature-catalog.test.ts
// The owner feature-switchboard is a gate on real surfaces, so its pure resolution must be exact:
// defaults hide nothing (except penalties), a junk blob never blanks a portal, and a flag can only
// narrow WITHIN the plan — never grant a feature the plan lacks.
import { describe, it, expect } from "vitest";
import {
  FEATURE_CATALOG,
  FEATURE_CATALOG_BY_KEY,
  DEFAULT_FLAGS,
  FEATURE_KEYS,
  FEATURE_CATEGORIES,
  parseFeatureFlags,
  resolvedFlag,
  isFeatureLive,
} from "../feature-catalog";

describe("FEATURE_CATALOG integrity", () => {
  it("has unique keys", () => {
    const keys = FEATURE_CATALOG.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("every row's category is one of FEATURE_CATEGORIES", () => {
    for (const r of FEATURE_CATALOG) expect(FEATURE_CATEGORIES).toContain(r.category);
  });
  it("defaults are ON for everything except penalties", () => {
    for (const r of FEATURE_CATALOG) {
      expect(r.defaultOn).toBe(r.key !== "penalties");
    }
    expect(DEFAULT_FLAGS.penalties).toBe(false);
    expect(DEFAULT_FLAGS.wheel).toBe(true);
  });
  it("section-backed rows use key === adminSectionId (trivial nav gate)", () => {
    for (const r of FEATURE_CATALOG) {
      if (r.adminSectionId) expect(r.adminSectionId).toBe(r.key);
    }
  });
});

describe("parseFeatureFlags", () => {
  it("keeps only known keys with boolean values", () => {
    const out = parseFeatureFlags({ wheel: false, casino: true, bogus: true, drops: "yes" });
    expect(out).toEqual({ wheel: false, casino: true });
  });
  it("returns {} for non-objects / arrays / null (never blanks a portal)", () => {
    expect(parseFeatureFlags(null)).toEqual({});
    expect(parseFeatureFlags(undefined)).toEqual({});
    expect(parseFeatureFlags("nope")).toEqual({});
    expect(parseFeatureFlags([{ wheel: true }])).toEqual({});
    expect(parseFeatureFlags(42)).toEqual({});
  });
});

describe("resolvedFlag", () => {
  it("explicit value wins over the default", () => {
    expect(resolvedFlag({ wheel: false }, "wheel")).toBe(false);
    expect(resolvedFlag({ penalties: true }, "penalties")).toBe(true);
  });
  it("missing key falls through to the coded default", () => {
    expect(resolvedFlag({}, "wheel")).toBe(true);
    expect(resolvedFlag(null, "wheel")).toBe(true);
    expect(resolvedFlag({}, "penalties")).toBe(false);
  });
  it("unknown key resolves false", () => {
    expect(resolvedFlag({}, "does-not-exist")).toBe(false);
  });
});

describe("isFeatureLive — owner flag AND plan, never widening", () => {
  it("a no-plan feature is live whenever the owner flag is on (any plan)", () => {
    expect(isFeatureLive({}, "basic", "trivia")).toBe(true); // default on, no planFeature
    expect(isFeatureLive({ trivia: false }, "elite", "trivia")).toBe(false); // owner off
  });
  it("a plan-gated feature needs BOTH the flag AND the plan", () => {
    // casino requires plan feature "casino" (pro+)
    expect(isFeatureLive({ casino: true }, "basic", "casino")).toBe(false); // flag on but plan lacks it
    expect(isFeatureLive({ casino: true }, "pro", "casino")).toBe(true);
    expect(isFeatureLive({ casino: false }, "elite", "casino")).toBe(false); // plan has it but owner off
  });
  it("owner flag can only NARROW — never grants what the plan lacks", () => {
    // webhooks needs elite; on basic it can never be live regardless of the flag
    expect(isFeatureLive({ webhooks: true }, "basic", "webhooks")).toBe(false);
    expect(isFeatureLive({ webhooks: true }, "pro", "webhooks")).toBe(false);
    expect(isFeatureLive({ webhooks: true }, "elite", "webhooks")).toBe(true);
  });
  it("penalties stays off by default even on elite", () => {
    expect(isFeatureLive({}, "elite", "penalties")).toBe(false);
    expect(isFeatureLive({ penalties: true }, "elite", "penalties")).toBe(true);
  });
});

describe("planFeature references are valid entitlement features", () => {
  it("every row.planFeature is a real Feature", () => {
    const valid = new Set(["casino", "wheel", "predictions", "overlays", "subathon", "song_queue", "ai", "webhooks_out", "custom_branding"]);
    for (const r of FEATURE_CATALOG) if (r.planFeature) expect(valid.has(r.planFeature)).toBe(true);
  });
  it("FEATURE_KEYS matches the catalog and BY_KEY is complete", () => {
    expect(FEATURE_KEYS.size).toBe(FEATURE_CATALOG.length);
    for (const r of FEATURE_CATALOG) expect(FEATURE_CATALOG_BY_KEY[r.key]).toBe(r);
  });
});
