import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verifyEventSubSignature, isMessageFresh } from "@/lib/twitch";

const SECRET = "test-eventsub-secret";

// Re-create the signature Twitch would send: HMAC-SHA256 over id + timestamp + body.
function sign(messageId: string, timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(messageId + timestamp + body).digest("hex");
}

describe("verifyEventSubSignature", () => {
  beforeEach(() => {
    vi.stubEnv("TWITCH_EVENTSUB_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a correctly signed message", () => {
    const id = "msg-1";
    const ts = "2026-01-01T00:00:00Z";
    const body = '{"event":"sub"}';
    expect(verifyEventSubSignature(id, ts, body, sign(id, ts, body))).toBe(true);
  });

  it("rejects a tampered body", () => {
    const id = "msg-1";
    const ts = "2026-01-01T00:00:00Z";
    const sig = sign(id, ts, '{"event":"sub"}');
    expect(verifyEventSubSignature(id, ts, '{"event":"hacked"}', sig)).toBe(false);
  });

  it("rejects a null signature header", () => {
    expect(verifyEventSubSignature("x", "y", "z", null)).toBe(false);
  });

  it("rejects a malformed (length-mismatched) signature", () => {
    expect(verifyEventSubSignature("x", "y", "z", "sha256=deadbeef")).toBe(false);
  });

  it("rejects when the secret is not configured", () => {
    vi.stubEnv("TWITCH_EVENTSUB_SECRET", "");
    const id = "m";
    const ts = "t";
    const body = "b";
    expect(verifyEventSubSignature(id, ts, body, sign(id, ts, body))).toBe(false);
  });
});

describe("isMessageFresh", () => {
  it("accepts a timestamp from right now", () => {
    expect(isMessageFresh(new Date().toISOString())).toBe(true);
  });

  it("rejects a timestamp older than the default 10-minute window", () => {
    const old = new Date(Date.now() - 20 * 60_000).toISOString();
    expect(isMessageFresh(old)).toBe(false);
  });

  it("respects a custom window", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(isMessageFresh(fiveMinAgo, 10)).toBe(true);
    expect(isMessageFresh(fiveMinAgo, 2)).toBe(false);
  });
});
