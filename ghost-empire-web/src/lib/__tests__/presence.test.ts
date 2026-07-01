// src/lib/__tests__/presence.test.ts
import { describe, it, expect } from "vitest";
import {
  presenceKey,
  anonActor,
  userActor,
  isUserActor,
  actorUserId,
  PRESENCE_TTL_MS,
  PRESENCE_HEARTBEAT_MS,
} from "@/lib/presence-shared";

describe("presenceKey", () => {
  it("scopes the key per tenant", () => {
    expect(presenceKey("t1")).toBe("presence:t1");
    expect(presenceKey("other")).toBe("presence:other");
  });
  it("falls back to a default bucket for legacy null tenant", () => {
    expect(presenceKey(null)).toBe("presence:default");
  });
});

describe("anonActor", () => {
  it("accepts 8-32 lowercase hex and prefixes it", () => {
    expect(anonActor("deadbeef")).toBe("a:deadbeef");
    expect(anonActor("a".repeat(32))).toBe("a:" + "a".repeat(32));
  });
  it("normalizes case and whitespace", () => {
    expect(anonActor("  DEADBEEF12  ")).toBe("a:deadbeef12");
  });
  it("rejects malformed ids (shape is the security boundary)", () => {
    expect(anonActor("short")).toBeNull(); // non-hex
    expect(anonActor("abc")).toBeNull(); // too short
    expect(anonActor("g".repeat(12))).toBeNull(); // non-hex char
    expect(anonActor("a".repeat(33))).toBeNull(); // too long
    expect(anonActor("u:evil")).toBeNull(); // prefix injection
    expect(anonActor(42)).toBeNull();
    expect(anonActor(null)).toBeNull();
  });
});

describe("actor helpers", () => {
  it("round-trips a user actor", () => {
    const a = userActor("user_123");
    expect(a).toBe("u:user_123");
    expect(isUserActor(a)).toBe(true);
    expect(actorUserId(a)).toBe("user_123");
  });
  it("guests are not user actors", () => {
    expect(isUserActor("a:deadbeef")).toBe(false);
  });
});

describe("timing constants", () => {
  it("heartbeats at least twice per TTL window (one missed beat tolerated)", () => {
    expect(PRESENCE_HEARTBEAT_MS * 2).toBeLessThanOrEqual(PRESENCE_TTL_MS + PRESENCE_HEARTBEAT_MS);
    expect(PRESENCE_HEARTBEAT_MS).toBeLessThan(PRESENCE_TTL_MS);
  });
});
