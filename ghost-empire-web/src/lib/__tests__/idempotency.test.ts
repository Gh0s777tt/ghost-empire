// Unit tests for the pure idempotency-token derivation (no Redis). The claim/release glue is thin
// Redis I/O (like withLock) and is exercised via the routes; here we pin the deterministic parts.
import { describe, it, expect } from "vitest";
import { bodyHash, idempotencyToken } from "@/lib/idempotency";

const reqWith = (headers: Record<string, string> = {}) => new Request("http://x/api", { method: "POST", headers });

describe("bodyHash", () => {
  it("is deterministic for the same body (a double-clicked identical request maps to one token)", () => {
    expect(bodyHash({ itemId: "abc" })).toBe(bodyHash({ itemId: "abc" }));
  });
  it("differs for different bodies (distinct actions don't collide)", () => {
    expect(bodyHash({ itemId: "abc" })).not.toBe(bodyHash({ itemId: "xyz" }));
  });
  it("handles null/undefined bodies without throwing", () => {
    expect(typeof bodyHash(undefined)).toBe("string");
    expect(bodyHash(null)).toBe(bodyHash(undefined)); // both serialise to "null"
  });
});

describe("idempotencyToken", () => {
  it("prefers a client Idempotency-Key header over the body hash", () => {
    const t = idempotencyToken(reqWith({ "Idempotency-Key": "intent-123" }), { itemId: "abc" });
    expect(t).toBe("k:intent-123");
  });
  it("same header ⇒ same token even if the body differs (intent-scoped idempotency)", () => {
    const a = idempotencyToken(reqWith({ "Idempotency-Key": "k1" }), { itemId: "abc" });
    const b = idempotencyToken(reqWith({ "Idempotency-Key": "k1" }), { itemId: "xyz" });
    expect(a).toBe(b);
  });
  it("falls back to a body-hash token when no header is present", () => {
    const t = idempotencyToken(reqWith(), { itemId: "abc" });
    expect(t).toBe("b:" + bodyHash({ itemId: "abc" }));
  });
  it("caps an oversized header so a malicious key can't blow up the Redis key", () => {
    const t = idempotencyToken(reqWith({ "Idempotency-Key": "x".repeat(500) }), {});
    expect(t.length).toBeLessThanOrEqual(2 + 128);
  });
});
