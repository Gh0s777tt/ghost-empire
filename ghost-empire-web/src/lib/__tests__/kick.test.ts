import { describe, it, expect } from "vitest";
import { verifyKickSignature, isMessageFresh } from "../kick";

// verifyKickSignature's RSA happy-path needs Kick's private key (their public key is
// fetched from the network and not injectable), so here we cover the no-network guard.
// The replay-protection half (isMessageFresh) is pure logic and fully covered below —
// closing the Twitch/Kick asymmetry the audit flagged (Twitch's verify IS tested).
describe("verifyKickSignature", () => {
  it("returns false for a missing signature without any network call", async () => {
    expect(await verifyKickSignature("msg", new Date().toISOString(), "{}", null)).toBe(false);
  });
});

describe("isMessageFresh — Kick webhook replay protection", () => {
  const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

  it("accepts a just-now timestamp", () => {
    expect(isMessageFresh(iso(0))).toBe(true);
  });

  it("accepts a timestamp inside the freshness window", () => {
    expect(isMessageFresh(iso(-5 * 60_000))).toBe(true);
  });

  it("rejects a stale (replayed) timestamp older than maxAge", () => {
    expect(isMessageFresh(iso(-11 * 60_000))).toBe(false);
  });

  it("tolerates small clock skew on the future side (<2 min)", () => {
    expect(isMessageFresh(iso(60_000))).toBe(true);
  });

  it("rejects a spoofed far-future timestamp (>2 min ahead)", () => {
    expect(isMessageFresh(iso(11 * 60_000))).toBe(false);
  });

  it("rejects an unparseable / empty timestamp", () => {
    expect(isMessageFresh("not-a-date")).toBe(false);
    expect(isMessageFresh("")).toBe(false);
  });

  it("respects a custom maxAgeMinutes", () => {
    expect(isMessageFresh(iso(-2 * 60_000), 1)).toBe(false);
    expect(isMessageFresh(iso(-2 * 60_000), 5)).toBe(true);
  });
});
