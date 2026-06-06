import { describe, it, expect } from "vitest";
import { OVERLAY_FEEDS, getOverlayFeed, type OverlayFeedKey } from "@/lib/overlay-feeds";

const EXPECTED_KEYS: OverlayFeedKey[] = [
  "goals",
  "subathon",
  "polls",
  "predictions",
  "recent-events",
  "emoji-combo",
  "rumble",
  "wheel",
  "widget",
  "viewers",
  "chat",
];

describe("overlay feed registry", () => {
  it("registers every expected feed with a producer fn and a positive interval", () => {
    for (const key of EXPECTED_KEYS) {
      const def = OVERLAY_FEEDS[key];
      expect(def, key).toBeDefined();
      expect(typeof def.producer, key).toBe("function");
      expect(def.intervalMs, key).toBeGreaterThan(0);
    }
  });

  it("getOverlayFeed resolves known keys", () => {
    expect(getOverlayFeed("goals")).toBe(OVERLAY_FEEDS.goals);
    expect(getOverlayFeed("recent-events")).toBe(OVERLAY_FEEDS["recent-events"]);
  });

  it("getOverlayFeed rejects unknown keys (incl. the bespoke alert queue) and prototype keys", () => {
    expect(getOverlayFeed("queue")).toBeNull(); // alert overlay is bespoke, not in the registry
    expect(getOverlayFeed("nope")).toBeNull();
    expect(getOverlayFeed("__proto__")).toBeNull(); // hasOwnProperty guard, not inherited props
    expect(getOverlayFeed("constructor")).toBeNull();
  });
});
