import { describe, it, expect } from "vitest";
import { linkableEmail, asVerifiedFlag } from "@/lib/oauth-email";

// These guard the account-takeover fix (payments/security audit, MEDIUM): NextAuth's
// allowDangerousEmailAccountLinking auto-merges on `profile.email`, so an UNVERIFIED email
// reaching that field is a takeover vector in both directions. linkableEmail() is the single
// gate that keeps `profile.email` non-null ONLY for provider-verified addresses. The
// per-provider blocks below mirror the exact derivation in lib/auth.ts so the security-
// relevant outcomes are pinned (auth.ts itself boots NextAuth at import, so it can't be
// unit-imported without a DB/env — same reasoning as auth-adapter.test.ts).

describe("asVerifiedFlag", () => {
  it("maps boolean and stringy truthy/falsy claims to a strict tri-state", () => {
    expect(asVerifiedFlag(true)).toBe(true);
    expect(asVerifiedFlag("true")).toBe(true);
    expect(asVerifiedFlag(false)).toBe(false);
    expect(asVerifiedFlag("false")).toBe(false);
  });

  it("treats any non-boolean-ish value as 'no signal' (undefined)", () => {
    for (const v of [undefined, null, "", "yes", 1, 0, {}, []]) {
      expect(asVerifiedFlag(v)).toBeUndefined();
    }
  });
});

describe("linkableEmail", () => {
  it("returns null for an absent/empty/non-string email regardless of verification", () => {
    expect(linkableEmail(null, true)).toBeNull();
    expect(linkableEmail(undefined, true)).toBeNull();
    expect(linkableEmail("", true)).toBeNull();
    // A non-string can't be a link key even if a provider fudges the type.
    expect(linkableEmail(123 as unknown as string, true)).toBeNull();
  });

  it("NEVER links an explicitly-unverified email — even with trustWhenUnsignalled", () => {
    expect(linkableEmail("a@b.com", false)).toBeNull();
    expect(linkableEmail("a@b.com", false, true)).toBeNull();
  });

  it("fails closed on 'no signal' by default (undefined verified, no trust)", () => {
    expect(linkableEmail("a@b.com", undefined)).toBeNull();
  });

  it("links on 'no signal' only when the caller explicitly trusts the source", () => {
    expect(linkableEmail("a@b.com", undefined, true)).toBe("a@b.com");
  });

  it("links a verified email", () => {
    expect(linkableEmail("a@b.com", true)).toBe("a@b.com");
    expect(linkableEmail("a@b.com", true, false)).toBe("a@b.com");
  });
});

// ---- Provider derivations (mirror lib/auth.ts) --------------------------------------------

describe("Twitch profile email (id_token only — no Helix backfill)", () => {
  // auth.ts: idTokenEmail = string email || null;
  //          verified = idTokenEmail ? (asVerifiedFlag(email_verified) ?? true) : undefined;
  //          email = linkableEmail(idTokenEmail, verified)
  const twitchEmail = (p: Record<string, unknown>) => {
    const idTokenEmail = (typeof p.email === "string" && p.email) || null;
    const verified = idTokenEmail ? (asVerifiedFlag(p.email_verified) ?? true) : undefined;
    return linkableEmail(idTokenEmail, verified);
  };

  it("links when the id_token carries the email (presence ⇒ verified)", () => {
    expect(twitchEmail({ email: "v@x.com" })).toBe("v@x.com");
    expect(twitchEmail({ email: "v@x.com", email_verified: true })).toBe("v@x.com");
  });

  it("does NOT link when Twitch explicitly marks the email unverified", () => {
    expect(twitchEmail({ email: "v@x.com", email_verified: false })).toBeNull();
  });

  it("does NOT link when the id_token omits the email (the takeover fix — Helix is gone)", () => {
    // Previously the Helix /users backfill supplied this email regardless of verification,
    // letting an attacker's unverified-victim-email Twitch account link onto the victim.
    expect(twitchEmail({})).toBeNull();
    expect(twitchEmail({ email: "" })).toBeNull();
  });
});

describe("Discord profile email (gated on `verified`)", () => {
  const discordEmail = (p: Record<string, unknown>) =>
    linkableEmail(typeof p.email === "string" ? p.email : null, asVerifiedFlag(p.verified), true);

  it("links a verified Discord email", () => {
    expect(discordEmail({ email: "d@x.com", verified: true })).toBe("d@x.com");
  });

  it("does NOT link an explicitly-unverified Discord email", () => {
    expect(discordEmail({ email: "d@x.com", verified: false })).toBeNull();
  });

  it("still links when the flag is absent (present with `email` scope; don't break login)", () => {
    expect(discordEmail({ email: "d@x.com" })).toBe("d@x.com");
  });
});

describe("Google profile email (gated on `email_verified`)", () => {
  const googleEmail = (p: Record<string, unknown>) =>
    linkableEmail(typeof p.email === "string" ? p.email : null, asVerifiedFlag(p.email_verified), true);

  it("links a verified Google email", () => {
    expect(googleEmail({ email: "g@x.com", email_verified: true })).toBe("g@x.com");
  });

  it("does NOT link when Google flags the email unverified", () => {
    expect(googleEmail({ email: "g@x.com", email_verified: false })).toBeNull();
  });

  it("links when the claim is absent (consumer Google is always verified)", () => {
    expect(googleEmail({ email: "g@x.com" })).toBe("g@x.com");
  });
});

describe("Kick profile email (no verification signal — NEVER a linking key)", () => {
  // Kick's docs were checked (2026-07-24) and give us nothing to gate on: it is OAuth 2.1
  // and not OIDC (no id_token/`openid` scope/userinfo claims), /public/v1/users returns only
  // user_id+name+email+profile_picture, no scope exposes verification, and verification gates
  // streaming/chat rather than the OAuth authorization. So we fail closed
  // (trustWhenUnsignalled=false) — a Kick login gets a SEPARATE account and users link it
  // themselves via the authenticated /profile flow. See auth.ts comment.
  const kickEmail = (p: Record<string, unknown>) =>
    linkableEmail(typeof p.email === "string" ? p.email : null, undefined, false);

  it("does NOT link a Kick email — no verification signal means no auto-merge", () => {
    // The takeover this blocks: an attacker registers a Kick account on the victim's
    // address and it silently merges onto the victim's Google/Discord/Twitch account.
    expect(kickEmail({ email: "k@x.com" })).toBeNull();
  });

  it("returns null when Kick supplies no email", () => {
    expect(kickEmail({})).toBeNull();
    expect(kickEmail({ email: null })).toBeNull();
  });

  it("would link again the day Kick ships a verification flag (no code change but the flag)", () => {
    // Forward-compat pin for the documented upgrade path: feed asVerifiedFlag(...) in place
    // of `undefined` and the same call links verified addresses and rejects unverified ones.
    const future = (p: Record<string, unknown>) =>
      linkableEmail(typeof p.email === "string" ? p.email : null, asVerifiedFlag(p.email_verified), false);
    expect(future({ email: "k@x.com", email_verified: true })).toBe("k@x.com");
    expect(future({ email: "k@x.com", email_verified: false })).toBeNull();
  });
});
