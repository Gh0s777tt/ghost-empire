// src/lib/daily-chips.ts
// Per-portal size of the FREE daily casino-chips grant (docs/CHIPS-CASINO.md — Faza 3/6).
// The amount is owner-tunable because it is the casino's main faucet: too small and the
// tables sit empty, too large and every sink (bets, cosmetics) stops being a challenge.
//
// Why this is safe to expose: chips are free, non-purchasable and non-cashable, so this dial
// cannot mint anything of value — it only sets how fast a value-less currency flows. It still
// gets bounds: `0` would silently kill the only chips faucet a portal has, and an unbounded
// value would drown the shop's chips sink in one day (and make the economy panel's chips loop
// meaningless). Pure + unit-tested; the DB read/write lives in tenant/onboarding.

/** Grant used when a portal has no explicit setting (and the pre-migration hardcoded value). */
export const DAILY_CHIPS_DEFAULT = 500;
/** Below this a portal effectively has no free faucet — the casino would be unplayable. */
export const DAILY_CHIPS_MIN = 50;
/** Above this one day's grant dwarfs the cosmetics sink; keeps the loop meaningful. */
export const DAILY_CHIPS_MAX = 100_000;

/**
 * Coerce an owner-supplied daily-grant amount into the allowed range.
 *
 * @param raw - Anything off a request body / DB column (number, numeric string, junk).
 * @returns A whole number within [{@link DAILY_CHIPS_MIN}, {@link DAILY_CHIPS_MAX}].
 *   Non-finite or missing input falls back to {@link DAILY_CHIPS_DEFAULT} rather than to a
 *   bound — a malformed value must not silently reconfigure a portal's economy to an extreme.
 *
 * @example
 * ```ts
 * normalizeDailyChips(1200);      // → 1200
 * normalizeDailyChips("2000");    // → 2000
 * normalizeDailyChips(5);         // → 50      (clamped to the floor)
 * normalizeDailyChips(undefined); // → 500     (default, not a bound)
 * ```
 */
export function normalizeDailyChips(raw: unknown): number {
  // `Number(null)`, `Number("")` and `Number([])` are all 0 — a FINITE number — so a bare
  // `Number.isFinite` check would read "no value" as "set the faucet to the floor". Only a
  // number or a non-empty string counts as an intent to set something.
  const isSettable = typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "");
  if (!isSettable) return DAILY_CHIPS_DEFAULT;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return DAILY_CHIPS_DEFAULT;
  return Math.min(DAILY_CHIPS_MAX, Math.max(DAILY_CHIPS_MIN, n));
}
