// src/lib/__tests__/particle-burst.test.ts — pure parts of the alert particle burst (#770).
import { describe, it, expect } from "vitest";
import { burstOrigin, typeMultiplier } from "@/app/overlay/ParticleBurst";

describe("burstOrigin", () => {
  it("maps every alert anchor slot into the unit square", () => {
    const slots = ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"];
    for (const s of slots) {
      const { fx, fy } = burstOrigin(s);
      expect(fx).toBeGreaterThan(0);
      expect(fx).toBeLessThan(1);
      expect(fy).toBeGreaterThan(0);
      expect(fy).toBeLessThan(1);
    }
  });
  it("falls back to the bottom-right default anchor for unknown positions", () => {
    expect(burstOrigin("bogus")).toEqual(burstOrigin("bottom-right"));
  });
  it("mirrors left/right slots around the center", () => {
    expect(burstOrigin("top-left").fx + burstOrigin("top-right").fx).toBeCloseTo(1);
    expect(burstOrigin("bottom-left").fy).toBeCloseTo(burstOrigin("bottom-right").fy);
  });
});

describe("typeMultiplier", () => {
  it("celebrates money/sub alerts hardest", () => {
    expect(typeMultiplier("donation")).toBe(1.5);
    expect(typeMultiplier("twitch_gift_sub")).toBe(1.5);
    expect(typeMultiplier("shop_purchase")).toBe(1.5);
  });
  it("mid-tier for cheers and event wins", () => {
    expect(typeMultiplier("twitch_cheer")).toBe(1.2);
    expect(typeMultiplier("event_win")).toBe(1.2);
  });
  it("defaults to 1 for everything else (incl. undefined)", () => {
    expect(typeMultiplier("welcome")).toBe(1);
    expect(typeMultiplier(undefined)).toBe(1);
  });
});
