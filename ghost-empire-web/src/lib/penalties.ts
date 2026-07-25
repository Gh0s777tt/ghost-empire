// src/lib/penalties.ts
// "Kary" — donation-triggered random stream penalties (#806). PURE logic only: the draw, the
// eligibility tiers, the cooldown and the serial queue. No DB, no OBS, no I/O — so every rule below
// is unit-tested without mocks, which is the point: this decides what a paying viewer gets.
//
// THE PRODUCT: a viewer's donation crossing a threshold makes the system draw a penalty to inflict on
// the stream — the TYPE, its INTENSITY and its DURATION are all drawn, not chosen. "Nobody has any
// influence on the result" is the whole appeal, so the draw has to be genuinely random AND auditable.
//
// WHAT IS DELIBERATELY REUSED, not rewritten:
//  - `pickWeightedIndex` from `lib/economy.ts` — the same weighted picker the wheel and collectible
//    rarities already use. A second weighted-pick implementation is how this codebase previously ended
//    up with four donation pipelines minting at three different rates.
//  - `cryptoRng` from `lib/secure-rng.ts` at the call site — never `Math.random()`. Every function
//    here takes the randomness as an injected `() => number` in [0,1), so the caller supplies the
//    CSPRNG in production and a fixed sequence in tests.
//
// ⚠️ LEGAL: paying real money for a RANDOM outcome is structurally the shape art. 2 ust. 5 describes.
// The payer wins nothing — the effect happens on the streamer's screen and has no material value to
// them — so the exposure looks weaker than the casino's, but it is the same category of question and
// it is on the lawyer list in `docs/CHIPS-CASINO.md`. The feature therefore ships **disabled per
// portal** and must not be switched on in production before that answer.
import { pickWeightedIndex } from "@/lib/economy";

/** A drawable penalty, as configured by the streamer. Ranges are inclusive. */
export type PenaltySpec = {
  id: string;
  /** Relative draw weight. `<= 0` removes it from the pool without deleting the row. */
  weight: number;
  /** Smallest donation (in PLN) that puts this penalty in the pool. 0 = always eligible. */
  minPln: number;
  /** Intensity band, 1–5. The drawn value is what the actuator scales the effect by. */
  minIntensity: number;
  maxIntensity: number;
  /** Duration band in milliseconds. */
  minDurationMs: number;
  maxDurationMs: number;
};

/** The outcome of one draw. */
export type PenaltyDraw = {
  penaltyId: string;
  intensity: number;
  durationMs: number;
};

/** Absolute bounds, enforced regardless of what a streamer types into the panel. */
export const INTENSITY_MIN = 1;
export const INTENSITY_MAX = 5;
/** A penalty shorter than this is invisible; longer than this hijacks the stream. */
export const DURATION_MIN_MS = 500;
export const DURATION_MAX_MS = 120_000;
/** How many penalties may wait behind the running one. Beyond this, extras are dropped, not queued. */
export const MAX_QUEUE_DEPTH = 5;

/**
 * The penalties a donation of `plnAmount` may draw from.
 *
 * @param pool - Every configured penalty for the portal.
 * @param plnAmount - The donation's value in PLN.
 * @returns Only enabled, positively-weighted penalties whose tier the donation reaches.
 *
 * @remarks
 * Tiering is what makes a bigger donation feel different: a 5 zł tip draws from the mild end, a 100 zł
 * one unlocks the nasty entries as well. It is a FILTER, never a boost — a large donation cannot make
 * a mild penalty more likely than its weight says, so the published odds stay honest.
 */
export function eligiblePenalties(pool: PenaltySpec[], plnAmount: number): PenaltySpec[] {
  if (!Number.isFinite(plnAmount) || plnAmount <= 0) return [];
  return pool.filter((p) => p.weight > 0 && plnAmount >= p.minPln);
}

/** Clamp an intensity band into the absolute range, keeping min <= max. */
function intensityBand(p: PenaltySpec): [number, number] {
  const lo = Math.min(Math.max(Math.round(p.minIntensity) || INTENSITY_MIN, INTENSITY_MIN), INTENSITY_MAX);
  const hi = Math.min(Math.max(Math.round(p.maxIntensity) || lo, lo), INTENSITY_MAX);
  return [lo, hi];
}

/** Clamp a duration band into the absolute range, keeping min <= max. */
function durationBand(p: PenaltySpec): [number, number] {
  const lo = Math.min(Math.max(Math.round(p.minDurationMs) || DURATION_MIN_MS, DURATION_MIN_MS), DURATION_MAX_MS);
  const hi = Math.min(Math.max(Math.round(p.maxDurationMs) || lo, lo), DURATION_MAX_MS);
  return [lo, hi];
}

/** Uniform integer in [lo, hi] from one `rng` value in [0,1). */
function intIn(lo: number, hi: number, rng: number): number {
  if (hi <= lo) return lo;
  const clamped = Math.min(Math.max(rng, 0), 0.9999999);
  return lo + Math.floor(clamped * (hi - lo + 1));
}

/**
 * Draw one penalty: which, how hard, for how long.
 *
 * @param pool - The ELIGIBLE penalties (run {@link eligiblePenalties} first).
 * @param rng - Randomness source in [0,1). Production passes `cryptoRng`; tests pass a fixed sequence.
 * @returns The draw, or null when the pool is empty — the caller must then do nothing rather than
 *          invent a penalty, because a viewer who paid and got a fabricated outcome is worse than one
 *          who paid and got a refundable "no penalties configured".
 *
 * @remarks
 * Exactly three `rng` calls, in a fixed order (penalty → intensity → duration). The order is part of
 * the contract: a provably-fair scheme replays the same seed and must land on the same outcome.
 *
 * @example
 * ```ts
 * const draw = drawPenalty(eligiblePenalties(pool, 25), cryptoRng);
 * ```
 */
export function drawPenalty(pool: PenaltySpec[], rng: () => number): PenaltyDraw | null {
  if (pool.length === 0) return null;

  const picked = pool[pickWeightedIndex(pool.map((p) => p.weight), rng())];
  if (!picked) return null;

  const [iLo, iHi] = intensityBand(picked);
  const [dLo, dHi] = durationBand(picked);

  return {
    penaltyId: picked.id,
    intensity: intIn(iLo, iHi, rng()),
    durationMs: intIn(dLo, dHi, rng()),
  };
}

/**
 * Whether a portal may fire a penalty right now.
 *
 * @param lastFiredAt - When this portal last STARTED a penalty, or null.
 * @param cooldownMs - The streamer's configured minimum gap.
 * @param now - Current time.
 *
 * @remarks
 * Without this, ten donations inside a minute stack ten simultaneous effects and the stream becomes
 * unwatchable — the same missing-cooldown gap the audit already flagged for shop and sound rewards.
 * A blocked penalty is NOT silently dropped: the caller queues it (see {@link queueSlot}).
 */
export function canFireNow(lastFiredAt: Date | null, cooldownMs: number, now: Date): boolean {
  if (!lastFiredAt) return true;
  const gap = Math.max(0, cooldownMs);
  return now.getTime() - lastFiredAt.getTime() >= gap;
}

/**
 * When a newly drawn penalty should start, given what is already running or waiting.
 *
 * @param busyUntil - When the portal is free again (end of the last queued penalty), or null.
 * @param cooldownMs - Minimum gap between two penalties starting.
 * @param now - Current time.
 * @param queueDepth - How many penalties are already waiting.
 * @returns The start instant, or null when the queue is full.
 *
 * @remarks
 * Penalties run STRICTLY ONE AT A TIME. Two effects toggling the same OBS filter concurrently would
 * race on the revert — whichever timer fires second re-enables a filter the other just turned off,
 * leaving the streamer's scene permanently broken. Serialising is therefore a correctness requirement,
 * not a nicety. When the queue is full the extra draw is refused so a raid cannot buy an hour of
 * effects in ten seconds.
 */
export function queueSlot(
  busyUntil: Date | null,
  cooldownMs: number,
  now: Date,
  queueDepth: number,
): Date | null {
  if (queueDepth >= MAX_QUEUE_DEPTH) return null;
  const earliest = now.getTime();
  const afterBusy = busyUntil ? busyUntil.getTime() + Math.max(0, cooldownMs) : earliest;
  return new Date(Math.max(earliest, afterBusy));
}
