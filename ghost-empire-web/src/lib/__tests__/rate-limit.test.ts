import { describe, it, expect } from "vitest";
import { rateLimitHeaders } from "@/lib/rate-limit";

describe("rateLimitHeaders", () => {
  it("emits remaining + reset when the request is allowed", () => {
    const resetAt = new Date("2026-01-01T00:00:00Z");
    const headers = rateLimitHeaders({ allowed: true, remaining: 4, resetAt });
    expect(headers["X-RateLimit-Remaining"]).toBe("4");
    expect(headers["X-RateLimit-Reset"]).toBe(String(Math.ceil(resetAt.getTime() / 1000)));
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("adds Retry-After (seconds) when the request is blocked", () => {
    const resetAt = new Date(Date.now() + 30_000);
    const headers = rateLimitHeaders({
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterSeconds: 30,
    });
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
    expect(headers["Retry-After"]).toBe("30");
    expect(headers["X-RateLimit-Reset"]).toBe(String(Math.ceil(resetAt.getTime() / 1000)));
  });
});
