import { describe, it, expect } from "vitest";
import { signCompanionToken, verifyCompanionToken } from "@/lib/companion-token";

describe("companion token (stateless HMAC)", () => {
  it("round-trips userId + tenantId", () => {
    const tok = signCompanionToken("user_1", "tenant_1");
    const p = verifyCompanionToken(tok);
    expect(p).toMatchObject({ userId: "user_1", tenantId: "tenant_1" });
  });

  it("supports null tenant (legacy single-tenant)", () => {
    const p = verifyCompanionToken(signCompanionToken("u", null));
    expect(p?.tenantId).toBeNull();
  });

  it("rejects a tampered payload (signature mismatch)", () => {
    const tok = signCompanionToken("user_1", "tenant_1");
    const [v, body, sig] = tok.split(".");
    // swap the payload for a different user, keep the old signature
    const forged = `${v}.${Buffer.from(JSON.stringify({ userId: "attacker", tenantId: "tenant_1", issuedAt: Date.now() })).toString("base64url")}.${sig}`;
    expect(verifyCompanionToken(forged)).toBeNull();
  });

  it("rejects malformed / empty / wrong-version tokens", () => {
    expect(verifyCompanionToken(null)).toBeNull();
    expect(verifyCompanionToken("")).toBeNull();
    expect(verifyCompanionToken("garbage")).toBeNull();
    expect(verifyCompanionToken("v1.abc.def")).toBeNull();
  });

  it("rejects an expired token (>7 days) but accepts a fresh one", () => {
    const tok = signCompanionToken("u", "t");
    const eightDays = 8 * 24 * 60 * 60 * 1000;
    expect(verifyCompanionToken(tok, Date.now() + eightDays)).toBeNull();
    expect(verifyCompanionToken(tok, Date.now() + 1000)).not.toBeNull();
  });
});
