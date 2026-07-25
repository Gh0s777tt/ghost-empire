// src/lib/__tests__/oauth-refresh.test.ts
// The pure half of the streamer-token refresh flow (no DB, no network). These functions decide
// whether a portal's Twitch/Kick connection survives an expiry or needs a human, so every case
// below is a concrete way the connection could silently die.
import { describe, it, expect } from "vitest";
import {
  needsTokenRefresh,
  tokenExpiryFrom,
  classifyRefreshFailure,
  normalizeScope,
  parseTokenPayload,
  OAuthTokenError,
  TOKEN_REFRESH_SKEW_MS,
} from "@/lib/oauth-refresh";

const NOW = Date.UTC(2026, 6, 25, 12, 0, 0); // fixed clock — these functions take `now` explicitly

describe("needsTokenRefresh", () => {
  it("leaves a comfortably-valid token alone", () => {
    expect(needsTokenRefresh(new Date(NOW + 60 * 60_000), NOW)).toBe(false);
  });

  it("refreshes once the token is inside the skew window", () => {
    // Exactly at the boundary counts as "refresh" — better one early rotation than a token that
    // dies between our check and the API call it guards.
    expect(needsTokenRefresh(new Date(NOW + TOKEN_REFRESH_SKEW_MS), NOW)).toBe(true);
    expect(needsTokenRefresh(new Date(NOW + TOKEN_REFRESH_SKEW_MS + 1), NOW)).toBe(false);
  });

  it("refreshes an already-expired token", () => {
    expect(needsTokenRefresh(new Date(NOW - 1), NOW)).toBe(true);
    expect(needsTokenRefresh(new Date(NOW - 30 * 86_400_000), NOW)).toBe(true);
  });

  it("treats an UNKNOWN expiry as 'refresh' — the callbacks write null when expires_in is absent", () => {
    expect(needsTokenRefresh(null, NOW)).toBe(true);
    expect(needsTokenRefresh(undefined, NOW)).toBe(true);
  });

  it("honours a custom skew", () => {
    const in3min = new Date(NOW + 3 * 60_000);
    expect(needsTokenRefresh(in3min, NOW, 60_000)).toBe(false);
    expect(needsTokenRefresh(in3min, NOW, 10 * 60_000)).toBe(true);
  });
});

describe("tokenExpiryFrom", () => {
  it("uses the provider's expires_in", () => {
    expect(tokenExpiryFrom(14_400, NOW).getTime()).toBe(NOW + 14_400_000); // Twitch's ~4 h
  });

  it("falls back to the default TTL for a missing/garbage expires_in, never 'unknown'", () => {
    // Persisting "unknown" would make needsTokenRefresh fire on every single call, burning one
    // refresh-token rotation per request.
    for (const bad of [null, undefined, 0, -1, NaN, Infinity]) {
      expect(tokenExpiryFrom(bad, NOW).getTime()).toBe(NOW + 3600_000);
    }
  });

  it("heals a row that had no expiry — the next check no longer refreshes", () => {
    expect(needsTokenRefresh(null, NOW)).toBe(true);
    expect(needsTokenRefresh(tokenExpiryFrom(3600, NOW), NOW)).toBe(false);
  });
});

describe("classifyRefreshFailure", () => {
  it("treats 401/403 as needing a human re-connect", () => {
    expect(classifyRefreshFailure(401, "")).toBe("reauth_required");
    expect(classifyRefreshFailure(403, "Forbidden")).toBe("reauth_required");
  });

  it("recognises Twitch's prose for a dead grant (it does NOT send invalid_grant)", () => {
    // Real body: {"error":"Bad Request","status":400,"message":"Invalid refresh token"} — matching
    // only the RFC codes would misread a genuinely dead Twitch connection as transient, so the
    // streamer would never be told to re-connect.
    expect(
      classifyRefreshFailure(400, '{"error":"Bad Request","status":400,"message":"Invalid refresh token"}'),
    ).toBe("reauth_required");
  });

  it("recognises the RFC 6749 §5.2 fatal codes", () => {
    for (const code of ["invalid_grant", "invalid_client", "invalid_request", "unsupported_grant_type"]) {
      expect(classifyRefreshFailure(400, `{"error":"${code}"}`)).toBe("reauth_required");
    }
  });

  it("keeps a bare 400 transient — a provider blip must not nag for a re-connect", () => {
    expect(classifyRefreshFailure(400, '{"error":"try again"}')).toBe("transient");
    expect(classifyRefreshFailure(400, "")).toBe("transient");
  });

  it("keeps 5xx and rate limits transient", () => {
    for (const status of [429, 500, 502, 503]) {
      expect(classifyRefreshFailure(status, "invalid_grant")).toBe("transient");
    }
  });
});

describe("normalizeScope", () => {
  it("joins Twitch's array form with spaces", () => {
    // Persisting the array's default stringification would write "clips:edit,user:read:email" and
    // quietly break `scope.split(/\s+/).includes("clips:edit")` — the gate on createTwitchClip.
    expect(normalizeScope(["clips:edit", "user:read:email"])).toBe("clips:edit user:read:email");
    expect(normalizeScope(["clips:edit"])?.split(/\s+/).includes("clips:edit")).toBe(true);
  });

  it("passes Kick's string form through", () => {
    expect(normalizeScope("user:read channel:read events:subscribe")).toBe(
      "user:read channel:read events:subscribe",
    );
  });

  it("returns null for anything else, so the stored scope is left untouched", () => {
    expect(normalizeScope(undefined)).toBeNull();
    expect(normalizeScope(null)).toBeNull();
    expect(normalizeScope(42)).toBeNull();
  });
});

describe("parseTokenPayload", () => {
  it("normalises a full Twitch response", () => {
    const out = parseTokenPayload(
      "twitch",
      JSON.stringify({
        access_token: "at-new",
        refresh_token: "rt-new",
        expires_in: 14_400,
        scope: ["clips:edit"],
      }),
    );
    expect(out).toEqual({
      accessToken: "at-new",
      refreshToken: "rt-new",
      expiresIn: 14_400,
      scope: "clips:edit",
    });
  });

  it("reports a missing refresh_token as null — 'keep the stored one', not 'wipe it'", () => {
    const out = parseTokenPayload("kick", JSON.stringify({ access_token: "at", expires_in: 3600 }));
    expect(out.refreshToken).toBeNull();
    expect(out.scope).toBeNull();
  });

  it("rejects a 2xx with no access_token rather than persisting undefined", () => {
    // Writing `undefined` over a working credential would turn an upstream hiccup into a permanent
    // outage that only a manual re-connect fixes.
    expect(() => parseTokenPayload("kick", JSON.stringify({ token_type: "bearer" }))).toThrow(
      OAuthTokenError,
    );
    expect(() => parseTokenPayload("kick", JSON.stringify({ access_token: "" }))).toThrow(
      OAuthTokenError,
    );
  });

  it("rejects a non-JSON body (login page / proxy error) with a retryable code", () => {
    let caught: unknown;
    try {
      parseTokenPayload("twitch", "<html><body>502 Bad Gateway</body></html>");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OAuthTokenError);
    expect((caught as OAuthTokenError).code).toBe("refresh_failed");
    expect((caught as OAuthTokenError).provider).toBe("twitch");
  });
});
