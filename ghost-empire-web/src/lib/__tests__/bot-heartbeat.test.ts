import { describe, it, expect } from "vitest";
import { isHeartbeatFresh, HEARTBEAT_FRESH_MS } from "@/lib/bot-heartbeat";

describe("isHeartbeatFresh", () => {
  const now = 1_000_000_000;

  it("fresh just after a beat", () => {
    expect(isHeartbeatFresh(now - 1_000, now)).toBe(true);
  });

  it("fresh right up to the window edge", () => {
    expect(isHeartbeatFresh(now - (HEARTBEAT_FRESH_MS - 1), now)).toBe(true);
  });

  it("stale at and past the window", () => {
    expect(isHeartbeatFresh(now - HEARTBEAT_FRESH_MS, now)).toBe(false);
    expect(isHeartbeatFresh(now - HEARTBEAT_FRESH_MS * 10, now)).toBe(false);
  });

  it("null/undefined/zero → offline, never throws", () => {
    expect(isHeartbeatFresh(null, now)).toBe(false);
    expect(isHeartbeatFresh(undefined, now)).toBe(false);
    expect(isHeartbeatFresh(0, now)).toBe(false);
  });

  it("a beat 'from the future' (clock skew) still counts as fresh", () => {
    expect(isHeartbeatFresh(now + 5_000, now)).toBe(true);
  });
});
