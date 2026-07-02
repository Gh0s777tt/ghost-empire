// src/lib/secure-rng.ts
// Crypto-backed uniform [0,1) source for money-path randomness. Anything with real GT
// value — casino games (slots/roulette/dice/crash/plinko/scratch/blackjack/mines/hilo),
// duels, heists — should draw from the CSPRNG rather than `Math.random`, so an outcome
// can't be predicted from a recovered PRNG state. The pure game functions keep an
// injectable `rng` param (default `Math.random`) for deterministic tests; production
// passes this. 1e-6 granularity is far finer than any reel/card/bucket draw needs.
import { randomInt } from "node:crypto";

/** Uniform random in [0, 1) from Node's CSPRNG. Server-only (imports `node:crypto`). */
export const cryptoRng = (): number => randomInt(0, 1_000_000) / 1_000_000;
