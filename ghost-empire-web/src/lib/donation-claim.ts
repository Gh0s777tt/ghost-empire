// src/lib/donation-claim.ts
// Matching rules for viewer self-claims on unmatched (codeless) donations.
//
// SECURITY MODEL — read before changing anything here:
//   * A claim NEVER credits. It is an assertion shown to the streamer next to the queue row; the
//     existing admin assign action is the only thing that mints (#audit3: donor facts are
//     guessable, so approval stays human).
//   * Matching happens HERE, ADMIN-SIDE — never at submit time. The public /support wall prints
//     exact donation amounts, so amount+currency+date is not a secret: an endpoint that answered
//     "matched / not matched" would be an existence oracle for other people's payments. The submit
//     path therefore stores the raw assertion and always answers the same thing.
//   * Every plausible claim is surfaced (never just the first), so a claim-jacker cannot occupy the
//     only slot the admin sees — contention is made visible instead of hidden.
// Pure (no I/O) → unit-tested; routes do the DB work and the rate limiting.

/** A stored viewer assertion (mirrors the DonationClaim selection used by the admin queue). */
export type StoredClaim = {
  id: string;
  userId: string;
  amountGrosze: number;
  currency: string;
  donatedOn: Date;
  evidence: string | null;
};

/** The queue row being matched against. */
export type QueueDonation = {
  id: string;
  amountGrosze: number;
  currency: string;
  donatedAt: Date;
};

/** How far the asserted date may sit from the recorded one, in EITHER direction. NB: a date-only
 *  input parses as UTC midnight, so the accepted span is ±this many days around that instant. */
export const CLAIM_WINDOW_DAYS = 3;
/** Nothing older than this may be asserted — bounds the queue and the guessing surface. */
export const CLAIM_MAX_AGE_DAYS = 90;
/** Cap on simultaneously-open assertions per user (anti-spam; enforced by the route). */
export const CLAIM_MAX_PENDING = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ClaimAssertion = { amount: number; currency: string; donatedOn: Date };

/** Valid assertion? (positive finite amount, sane currency, real and not-future date). Pure. */
export function isValidAssertion(a: Partial<ClaimAssertion> | null | undefined, now: Date = new Date()): a is ClaimAssertion {
  if (!a) return false;
  const amountOk = typeof a.amount === "number" && Number.isFinite(a.amount) && a.amount > 0 && a.amount < 1_000_000;
  const curOk = typeof a.currency === "string" && /^[A-Za-z]{3,8}$/.test(a.currency);
  if (!(a.donatedOn instanceof Date) || Number.isNaN(a.donatedOn.getTime())) return false;
  const age = now.getTime() - a.donatedOn.getTime();
  // Not in the future (allow a day of timezone slack) and not older than the claim horizon.
  const dateOk = age >= -DAY_MS && age <= CLAIM_MAX_AGE_DAYS * DAY_MS;
  return amountOk && curOk && dateOk;
}

/**
 * Every stored claim that could plausibly refer to `donation` — exact amount + currency, and an
 * asserted date within {@link CLAIM_WINDOW_DAYS} of the recorded one.
 *
 * @returns ALL matches (possibly several). The admin UI must show every one and flag contention;
 *          picking "the first" would let a claim-jacker hide the real donor.
 * @remarks unit-tested in `__tests__/donation-claim.test.ts`.
 */
export function claimsForDonation(donation: QueueDonation, claims: StoredClaim[]): StoredClaim[] {
  const cur = (donation.currency || "").toUpperCase();
  const at = donation.donatedAt.getTime();
  return claims.filter((c) => {
    if (Math.round(c.amountGrosze) !== Math.round(donation.amountGrosze)) return false;
    if ((c.currency || "").toUpperCase() !== cur) return false;
    return Math.abs(c.donatedOn.getTime() - at) <= CLAIM_WINDOW_DAYS * DAY_MS;
  });
}
