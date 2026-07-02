import { describe, it, expect } from "vitest";
import { ApiError, apiErrorReason } from "@/lib/api-client";

// apiErrorReason recovers a route's machine-readable code from a thrown ApiError so the
// UI can translate rate-limit / unauthorized / insufficient into a specific toast (#776).
describe("apiErrorReason", () => {
  it("recovers the `reason` code from the thrown body", () => {
    const e = new ApiError("rate-limited", 429, { ok: false, reason: "rate-limited" });
    expect(apiErrorReason(e)).toBe("rate-limited");
  });

  it("falls back to the `error` field when there is no reason", () => {
    expect(apiErrorReason(new ApiError("x", 400, { error: "bad-json" }))).toBe("bad-json");
  });

  it("prefers reason over error when both are present", () => {
    expect(apiErrorReason(new ApiError("m", 429, { reason: "rate-limited", error: "generic" }))).toBe("rate-limited");
  });

  it("returns null when there is no code / not an ApiError", () => {
    expect(apiErrorReason(new ApiError("x", 500, null))).toBeNull();
    expect(apiErrorReason(new ApiError("x", 500, { foo: 1 }))).toBeNull();
    expect(apiErrorReason(new Error("plain"))).toBeNull();
    expect(apiErrorReason("string")).toBeNull();
    expect(apiErrorReason(undefined)).toBeNull();
  });
});
