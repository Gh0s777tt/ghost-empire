import { describe, it, expect, vi, afterEach } from "vitest";

// signingKey() reads NEXTAUTH_SECRET at call time — make sure it's set before any token op.
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "test-secret-for-link-tokens";

import { createLinkToken, verifyLinkToken } from "@/lib/account-linking";

describe("account-linking tokens (HMAC sign/verify)", () => {
  afterEach(() => vi.useRealTimers());

  it("round-trips a valid token and recovers uid + provider", () => {
    const token = createLinkToken("user_123", "twitch");
    const payload = verifyLinkToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.uid).toBe("user_123");
    expect(payload?.provider).toBe("twitch");
  });

  it("rejects malformed / missing tokens", () => {
    for (const bad of [null, undefined, "", "nodot", ".", "a.", ".b"]) {
      expect(verifyLinkToken(bad as string | null | undefined)).toBeNull();
    }
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const [enc, sig] = createLinkToken("user_123", "twitch").split(".");
    const flipped = enc.slice(0, -1) + (enc.endsWith("A") ? "B" : "A");
    expect(verifyLinkToken(`${flipped}.${sig}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const [enc, sig] = createLinkToken("user_123", "twitch").split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(verifyLinkToken(`${enc}.${flipped}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = createLinkToken("user_123", "twitch");
    const original = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = "a-totally-different-secret";
    try {
      expect(verifyLinkToken(token)).toBeNull();
    } finally {
      process.env.NEXTAUTH_SECRET = original;
    }
  });

  it("rejects an expired token (past the 5-minute TTL)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createLinkToken("user_123", "twitch");
    expect(verifyLinkToken(token)).not.toBeNull(); // valid right after minting
    vi.setSystemTime(new Date("2026-01-01T00:06:00Z")); // +6 min > 5 min TTL
    expect(verifyLinkToken(token)).toBeNull();
  });
});
