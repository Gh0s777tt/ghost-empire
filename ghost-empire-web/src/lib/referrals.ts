// src/lib/referrals.ts
// Referral loop: every user gets a shareable code; a NEW user can claim a friend's
// code exactly once and both get REFERRAL_REWARD GT. Pure helpers here — the grant
// and the one-time atomic guard live in /api/referral. Anti-abuse leans on real
// OAuth accounts (Twitch/Discord/Google) + the one-claim-per-user constraint.

export const REFERRAL_REWARD = 500;
export const REFERRAL_CODE_LEN = 6;

// Unambiguous alphabet (no 0/O/1/I) so codes are easy to read aloud and share.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A random shareable referral code. `rand` is injectable for deterministic tests. */
export function generateReferralCode(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LEN; i++) out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return out;
}

/** Normalize user-typed input to the code format (uppercase, strip junk, clamp length). */
export function normalizeReferralCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, REFERRAL_CODE_LEN);
}

/** Valid = exactly REFERRAL_CODE_LEN chars, all from the alphabet. */
export function isValidReferralCode(s: string): boolean {
  return new RegExp(`^[${ALPHABET}]{${REFERRAL_CODE_LEN}}$`).test(s);
}
