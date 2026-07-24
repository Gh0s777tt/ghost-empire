// src/lib/oauth-email.ts
// Account-linking safety — the single decision "may this OAuth email be used as the
// cross-provider LINKING key?". This exists because of a MEDIUM account-takeover vector
// (payments/security audit): NextAuth's `allowDangerousEmailAccountLinking` auto-merges a
// new OAuth login onto ANY existing account with the same email, and it keys off exactly
// one value — the `email` our provider `profile()` callback returns. That same value is
// also written to `User.email`, which is itself the lookup key for the reverse direction.
// So an UNVERIFIED email flowing into `profile.email` is dangerous BOTH ways:
//   • forward  — attacker's new (unverified victim-email) account links onto the victim's;
//   • reverse  — the attacker's stored unverified email later swallows the victim's
//                verified login for the same address.
//
// The invariant this module enforces: `profile.email` is a non-null string ONLY when the
// provider has VERIFIED the user owns it. An unverified/absent email returns null, which
// makes NextAuth create a SEPARATE account (no auto-merge, no OAuthAccountNotLinked hard
// fail) — the safe outcome. `allowDangerousEmailAccountLinking` stays on so that VERIFIED
// same-email logins still merge; its danger is removed here, at the email layer.
//
// Pure (no I/O) so the whole state matrix is unit-tested directly — see oauth-email.test.ts.

/**
 * Normalize a provider's email-verification claim to a strict tri-state.
 *
 * OIDC/OAuth providers disagree on the wire type of their verification flag: some send a
 * JSON boolean (`true`), some a string (`"true"`). Everything else — a missing claim, a
 * number, `null` — is "no signal", which callers resolve via {@link linkableEmail}'s
 * `trustWhenUnsignalled`.
 *
 * @param v - The raw claim (e.g. Twitch/Google `email_verified`, Discord `verified`).
 * @returns `true` (verified), `false` (explicitly not verified), or `undefined` (no signal).
 * @example
 * asVerifiedFlag(true)     // true
 * asVerifiedFlag("false")  // false
 * asVerifiedFlag(undefined)// undefined
 */
export function asVerifiedFlag(v: unknown): boolean | undefined {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return undefined;
}

/**
 * Return `email` ONLY when it is safe to use as the cross-provider account-LINKING key.
 *
 * @remarks
 * The verification signal is authoritative when present:
 *  - `verified === false` → **never** link (explicit "not verified"), regardless of trust.
 *  - `verified === true`  → link-eligible.
 *  - `verified === undefined` (provider gives no signal) → link-eligible ONLY if the caller
 *    opts in via `trustWhenUnsignalled` (e.g. a provider we trust to verify at signup but
 *    which exposes no per-login flag — see Kick). Defaults to `false` (fail closed).
 *
 * A null/empty/non-string email is never link-eligible.
 *
 * @param email - The candidate email from the OAuth profile.
 * @param verified - Tri-state verification signal (see {@link asVerifiedFlag}).
 * @param trustWhenUnsignalled - Treat "no signal" as verified. Default `false` (fail closed).
 * @returns The email if link-eligible, otherwise `null`.
 * @example
 * linkableEmail("a@b.com", true)            // "a@b.com"  (verified)
 * linkableEmail("a@b.com", false)           // null       (explicitly unverified)
 * linkableEmail("a@b.com", undefined)       // null       (no signal, fail closed)
 * linkableEmail("a@b.com", undefined, true) // "a@b.com"  (no signal, caller trusts source)
 */
export function linkableEmail(
  email: string | null | undefined,
  verified: boolean | undefined,
  trustWhenUnsignalled = false,
): string | null {
  if (!email || typeof email !== "string") return null;
  if (verified === false) return null;
  if (verified === undefined && !trustWhenUnsignalled) return null;
  return email;
}
