// src/lib/__tests__/entitlements.test.ts
import { describe, it, expect } from "vitest";
import { normalizePlan, effectivePlan, planHasFeature } from "../entitlements";

describe("normalizePlan", () => {
  it("passes known plans and coerces junk to basic", () => {
    expect(normalizePlan("elite")).toBe("elite");
    expect(normalizePlan("pro")).toBe("pro");
    expect(normalizePlan("basic")).toBe("basic");
    expect(normalizePlan("founder")).toBe("basic");
    expect(normalizePlan(null)).toBe("basic");
    expect(normalizePlan(undefined)).toBe("basic");
  });
});

describe("effectivePlan", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  it("keeps the plan while unexpired or with no expiry", () => {
    expect(effectivePlan("elite", null, now)).toBe("elite");
    expect(effectivePlan("pro", new Date("2026-07-01"), now)).toBe("pro");
  });
  it("degrades an expired plan to basic", () => {
    expect(effectivePlan("elite", new Date("2026-06-01"), now)).toBe("basic");
    expect(effectivePlan("pro", new Date("2026-06-10T11:59:59Z"), now)).toBe("basic");
  });
});

describe("planHasFeature", () => {
  it("ladders features: basic ⊂ pro ⊂ elite", () => {
    expect(planHasFeature("basic", "casino")).toBe(false);
    expect(planHasFeature("pro", "casino")).toBe(true);
    expect(planHasFeature("pro", "ai")).toBe(false);
    expect(planHasFeature("pro", "webhooks_out")).toBe(false);
    expect(planHasFeature("elite", "casino")).toBe(true);
    expect(planHasFeature("elite", "ai")).toBe(true);
    expect(planHasFeature("elite", "custom_branding")).toBe(true);
  });
});
