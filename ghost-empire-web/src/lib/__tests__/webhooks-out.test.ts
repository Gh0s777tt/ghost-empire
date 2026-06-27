import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signWebhookBody } from "../webhooks-out";

// The outgoing-webhook HMAC signature is what every subscriber verifies — a silent
// regression in the format breaks all of them, so it's pinned here.
describe("signWebhookBody", () => {
  it("is the sha256= HMAC-SHA256 hex of the body keyed by the secret", () => {
    const secret = "test-secret";
    const body = JSON.stringify({ event: "donation", timestamp: "2026-06-27T00:00:00.000Z", data: { amount: 100 } });
    const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(signWebhookBody(secret, body)).toBe(expected);
  });

  it("always has the sha256= prefix and a 64-char hex digest", () => {
    expect(signWebhookBody("k", "{}")).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(signWebhookBody("s1", "body")).toBe(signWebhookBody("s1", "body"));
  });

  it("changes when the secret changes", () => {
    expect(signWebhookBody("s1", "body")).not.toBe(signWebhookBody("s2", "body"));
  });

  it("changes when the body changes", () => {
    expect(signWebhookBody("s1", "body")).not.toBe(signWebhookBody("s1", "body2"));
  });

  it("matches a fixed known vector (guards against algo/encoding drift)", () => {
    // echo -n 'hello' | openssl dgst -sha256 -hmac 'key'
    expect(signWebhookBody("key", "hello")).toBe(
      "sha256=9307b3b915efb5171ff14d8cb55fbcc798c6c0ef1456d66ded1a6aa723a58b7b",
    );
  });
});
