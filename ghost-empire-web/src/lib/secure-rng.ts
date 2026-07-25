// src/lib/secure-rng.ts
// Crypto-backed uniform [0,1) source for money-path randomness. Anything with real GT
// value — casino games (slots/roulette/dice/crash/plinko/scratch/blackjack/mines/hilo),
// duels, heists — should draw from the CSPRNG rather than `Math.random`, so an outcome
// can't be predicted from a recovered PRNG state. The pure game functions keep an
// injectable `rng` param (default `Math.random`) for deterministic tests; production
// passes this. 1e-6 granularity is far finer than any reel/card/bucket draw needs.
//
// The same policy covers *secrets*: any bearer token we mint (per-tenant bot secret,
// overlay tokens…) must come from `randomToken` below, never from `Math.random` — a
// guessable secret is an authentication bypass, not just a bad roll.
import { randomInt, randomBytes } from "node:crypto";

/** Uniform random in [0, 1) from Node's CSPRNG. Server-only (imports `node:crypto`). */
export const cryptoRng = (): number => randomInt(0, 1_000_000) / 1_000_000;

/**
 * Mint an unguessable bearer token from Node's CSPRNG, base64url-encoded.
 *
 * @param bytes - Entropy to draw, in bytes. Defaults to 32 (256 bits) — the floor for
 *   a long-lived secret that is compared, not hashed, and therefore never rotates on
 *   its own. Values below 16 are rejected rather than silently minting a weak token.
 * @returns A URL/header/`.env`-safe string (`A-Z a-z 0-9 - _`, no padding) — 43 chars
 *   at the default 32 bytes.
 *
 * @remarks
 * base64url (not hex) keeps the token short enough to paste into a `.env` line, and
 * safe to send verbatim in an `Authorization: Bearer …` header. Server-only.
 *
 * @example
 * ```ts
 * const secret = randomToken();            // 43 chars, 256 bits of entropy
 * const short  = randomToken(16);          // 22 chars, 128 bits
 * ```
 */
export function randomToken(bytes = 32): string {
  // A caller that asks for a token this small is almost certainly making a mistake —
  // fail loudly at the mint site rather than shipping a brute-forceable secret.
  if (!Number.isInteger(bytes) || bytes < 16) {
    throw new RangeError("randomToken: need at least 16 bytes of entropy");
  }
  return randomBytes(bytes).toString("base64url");
}
