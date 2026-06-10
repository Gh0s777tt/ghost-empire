// src/lib/__tests__/oauth-state.test.ts
import { describe, it, expect } from "vitest";
import { signOAuthState, verifyOAuthState } from "../oauth-state";
import { hmacSign, hmacVerify } from "../crypto";

describe("hmac sign/verify", () => {
  it("verifies its own signature and rejects tampering", () => {
    const sig = hmacSign("hello");
    expect(hmacVerify("hello", sig)).toBe(true);
    expect(hmacVerify("hello!", sig)).toBe(false);
    expect(hmacVerify("hello", sig.slice(0, -2) + "xx")).toBe(false);
  });
});

describe("oauth state", () => {
  it("round-trips tenantId + userId for the right provider", () => {
    const { state, nonce } = signOAuthState({ tenantId: "t_1", userId: "u_1", provider: "twitch-streamer" });
    const payload = verifyOAuthState(state, "twitch-streamer");
    expect(payload).not.toBeNull();
    expect(payload!.tenantId).toBe("t_1");
    expect(payload!.userId).toBe("u_1");
    expect(payload!.nonce).toBe(nonce);
  });

  it("carries a null tenant (legacy single-tenant flows)", () => {
    const { state } = signOAuthState({ tenantId: null, userId: "u_1", provider: "streamlabs" });
    expect(verifyOAuthState(state, "streamlabs")!.tenantId).toBeNull();
  });

  it("rejects a state replayed on a different provider", () => {
    const { state } = signOAuthState({ tenantId: "t_1", userId: "u_1", provider: "twitch-streamer" });
    expect(verifyOAuthState(state, "kick-streamer")).toBeNull();
  });

  it("rejects tampered payloads (signature breaks)", () => {
    const { state } = signOAuthState({ tenantId: "t_1", userId: "u_1", provider: "twitch-streamer" });
    const [v, body, sig] = state.split(".");
    const evil = Buffer.from(JSON.stringify({
      ...JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
      tenantId: "t_attacker",
    }), "utf8").toString("base64url");
    expect(verifyOAuthState(`${v}.${evil}.${sig}`, "twitch-streamer")).toBeNull();
  });

  it("rejects garbage and empty values", () => {
    expect(verifyOAuthState(null, "twitch-streamer")).toBeNull();
    expect(verifyOAuthState("", "twitch-streamer")).toBeNull();
    expect(verifyOAuthState("abc", "twitch-streamer")).toBeNull();
    expect(verifyOAuthState("v1.not-base64.sig", "twitch-streamer")).toBeNull();
  });

  it("rejects an expired state (>10 min)", () => {
    const { state } = signOAuthState({ tenantId: "t_1", userId: "u_1", provider: "twitch-streamer" });
    const [v, body] = state.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    payload.issuedAt = Date.now() - 11 * 60 * 1000;
    const staleBody = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    // re-sign so ONLY the age check can fail
    const resigned = `${v}.${staleBody}.${hmacSign(`${v}.${staleBody}`)}`;
    expect(verifyOAuthState(resigned, "twitch-streamer")).toBeNull();
  });
});
