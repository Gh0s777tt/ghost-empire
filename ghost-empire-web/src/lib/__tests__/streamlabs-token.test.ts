// Tests for the Streamlabs OAuth token-refresh decision logic (#801).
//
// Why these five functions: the refresh itself is a network POST + a DB write (not unit-testable
// by repo convention — no DB/network mocks), but every DECISION around it is pure and is exactly
// where the two-month production outage lived. `needsTokenRefresh` deciding "no" on a dead token
// silently stops real money from becoming GT, so the boundaries are pinned here.
import { describe, it, expect } from "vitest";
import {
  needsTokenRefresh,
  tokenExpiryFrom,
  classifyRefreshFailure,
  isHtmlResponse,
  StreamlabsAuthError,
  TOKEN_REFRESH_SKEW_MS,
} from "../streamlabs";

const NOW = Date.UTC(2026, 6, 25, 12, 0, 0); // fixed clock — all helpers take an injectable `now`
const at = (msFromNow: number) => new Date(NOW + msFromNow);

describe("needsTokenRefresh", () => {
  it("refreshes when the expiry is unknown, so a legacy row self-heals", () => {
    // The prod row that died had no usable expiry; treating null as "don't refresh" is what let
    // it poll with a dead token for two months.
    expect(needsTokenRefresh(null, NOW)).toBe(true);
    expect(needsTokenRefresh(undefined, NOW)).toBe(true);
  });

  it("refreshes a long-expired token (the #801 production row)", () => {
    expect(needsTokenRefresh(at(-60 * 24 * 60 * 60_000), NOW)).toBe(true);
  });

  it("does not refresh a token that is comfortably fresh", () => {
    expect(needsTokenRefresh(at(55 * 60_000), NOW)).toBe(false);
  });

  it("refreshes inside the skew window rather than racing the expiry mid-poll", () => {
    expect(needsTokenRefresh(at(TOKEN_REFRESH_SKEW_MS - 1_000), NOW)).toBe(true);
  });

  it("treats the skew boundary itself as due (inclusive)", () => {
    expect(needsTokenRefresh(at(TOKEN_REFRESH_SKEW_MS), NOW)).toBe(true);
    expect(needsTokenRefresh(at(TOKEN_REFRESH_SKEW_MS + 1), NOW)).toBe(false);
  });

  it("honours a caller-supplied skew", () => {
    const in10min = at(10 * 60_000);
    expect(needsTokenRefresh(in10min, NOW, 5 * 60_000)).toBe(false);
    expect(needsTokenRefresh(in10min, NOW, 30 * 60_000)).toBe(true);
  });
});

describe("tokenExpiryFrom", () => {
  it("converts expires_in seconds into an absolute expiry", () => {
    expect(tokenExpiryFrom(3600, NOW).getTime()).toBe(NOW + 3_600_000);
  });

  it("never returns null — a missing expires_in falls back to the default TTL", () => {
    // A null expiry would make needsTokenRefresh fire on EVERY poll, burning one refresh-token
    // rotation per cron tick.
    expect(tokenExpiryFrom(undefined, NOW).getTime()).toBe(NOW + 3_600_000);
    expect(tokenExpiryFrom(null, NOW).getTime()).toBe(NOW + 3_600_000);
  });

  it("falls back on garbage instead of minting an expiry in the past", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(tokenExpiryFrom(bad, NOW).getTime()).toBe(NOW + 3_600_000);
    }
  });

  it("produces an expiry that is NOT immediately due again (no refresh loop)", () => {
    expect(needsTokenRefresh(tokenExpiryFrom(undefined, NOW), NOW)).toBe(false);
    expect(needsTokenRefresh(tokenExpiryFrom(3600, NOW), NOW)).toBe(false);
  });
});

describe("classifyRefreshFailure", () => {
  it("treats a dead grant as needing a human re-connect", () => {
    expect(classifyRefreshFailure(400, '{"error":"invalid_grant"}')).toBe("reauth_required");
    expect(classifyRefreshFailure(400, '{"error":"invalid_client"}')).toBe("reauth_required");
    expect(classifyRefreshFailure(400, '{"error":"unsupported_grant_type"}')).toBe("reauth_required");
  });

  it("treats 401/403 as needing a re-connect", () => {
    expect(classifyRefreshFailure(401, "")).toBe("reauth_required");
    expect(classifyRefreshFailure(403, "")).toBe("reauth_required");
  });

  it("matches the OAuth error code case-insensitively", () => {
    expect(classifyRefreshFailure(400, "Invalid_Grant")).toBe("reauth_required");
  });

  it("treats upstream trouble as transient so a blip never nags the streamer", () => {
    expect(classifyRefreshFailure(500, "boom")).toBe("transient");
    expect(classifyRefreshFailure(502, "<html>bad gateway</html>")).toBe("transient");
    expect(classifyRefreshFailure(429, "slow down")).toBe("transient");
  });

  it("treats a bare 400 without an OAuth error marker as transient", () => {
    expect(classifyRefreshFailure(400, "something else entirely")).toBe("transient");
  });
});

describe("isHtmlResponse", () => {
  it("detects the login page Streamlabs serves on a 2xx for a dead token", () => {
    // The exact #801 symptom: HTTP 200 + an HTML login page instead of 401 + JSON.
    expect(isHtmlResponse("<!DOCTYPE html><html><head><title>Streamlabs</title>")).toBe(true);
    expect(isHtmlResponse("\n  <html lang=\"en\">")).toBe(true);
  });

  it("passes real JSON payloads through", () => {
    expect(isHtmlResponse('{"data":[{"donation_id":1}]}')).toBe(false);
    expect(isHtmlResponse("  []")).toBe(false);
    expect(isHtmlResponse("")).toBe(false);
  });
});

describe("StreamlabsAuthError", () => {
  it("carries the machine-readable code the poller and Sentry tag branch on", () => {
    const err = new StreamlabsAuthError("reauth_required", "re-connect in /admin");
    expect(err.code).toBe("reauth_required");
    expect(err.name).toBe("StreamlabsAuthError");
    expect(err.message).toBe("re-connect in /admin");
  });

  it("survives `instanceof` — both the retry branch and the errorCode surfacing depend on it", () => {
    // Two behaviours hinge on this narrowing: the one-shot reactive refresh (only for
    // `session_invalid`) and attaching `errorCode` to the poll result. A downlevelled
    // `extends Error` would break both SILENTLY — the poll would just stop retrying and the
    // Sentry tag would flatten to "fetch_failed". tsconfig `target` is ES2020, so classes are
    // native; this test fails loudly if that ever regresses.
    const err: unknown = new StreamlabsAuthError("session_invalid", "login page on 2xx");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StreamlabsAuthError);
    expect(err instanceof StreamlabsAuthError && err.code === "session_invalid").toBe(true);
  });
});
