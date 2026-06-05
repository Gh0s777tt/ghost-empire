// src/lib/economy.ts
// Pure economy math — no DB, no side effects, no env. Extracted so the
// money-critical logic (prediction payouts, season tiers, currency conversion)
// can be unit-tested in isolation. Callers in predictions.ts / seasons.ts /
// streamlabs.ts delegate here instead of inlining the arithmetic.

/**
 * Split a prediction pot among winners, proportional to each winner's stake.
 *
 * Each winner gets `floor((stake / totalStake) * pot)`; the LAST winner absorbs
 * the rounding remainder so the payouts sum to exactly `totalPot` (never over- or
 * under-pays). Order only decides who gets the remainder — pass a stable order.
 *
 * @param winnerStakes tokens each winning entry wagered (length = winner count)
 * @param totalPot     full pot to distribute (includes losers' absorbed stakes)
 * @returns            payout per winner, same order as input; sums to `totalPot`
 */
export function computePayouts(winnerStakes: number[], totalPot: number): number[] {
  const stakeSum = winnerStakes.reduce((s, x) => s + x, 0);
  if (winnerStakes.length === 0 || stakeSum <= 0) {
    return winnerStakes.map(() => 0);
  }
  const payouts: number[] = [];
  let distributed = 0;
  for (let i = 0; i < winnerStakes.length; i++) {
    const isLast = i === winnerStakes.length - 1;
    const payout = isLast
      ? totalPot - distributed
      : Math.floor((winnerStakes[i] / stakeSum) * totalPot);
    payouts.push(payout);
    distributed += payout;
  }
  return payouts;
}

/**
 * Battle-pass tier from accumulated XP. Tier 0 until the first `xpPerTier` is
 * reached, then +1 per `xpPerTier`, capped at `totalTiers` (the final tier can't
 * be exceeded). Guards against a zero/negative `xpPerTier`.
 */
export function tierFromXp(xp: number, xpPerTier: number, totalTiers: number): number {
  if (xpPerTier <= 0) return 0;
  return Math.min(totalTiers, Math.floor(xp / xpPerTier));
}

/**
 * Convert a donation / super-chat amount to a PLN-equivalent for goal tracking.
 * PLN (and the "ZL" alias) pass through unchanged; every other currency uses a
 * flat ×4 USD-equivalent fallback because we don't pull live FX rates. Shared by
 * Streamlabs donations and YouTube super chats so both bump goals consistently.
 */
export function plnFromCurrency(amount: number, currency: string): number {
  return ["PLN", "ZL"].includes(currency.toUpperCase()) ? amount : amount * 4;
}

// ---------- ACCOUNT LEVELING PERK ----------
// The level curve itself lives in lib/utils.ts (xpForLevel / levelFromXp / rankForLevel,
// already wired into the profile). This is just the GT earn perk granted by level.

export const MAX_LEVEL = 100;

/** GT earn multiplier granted by account level: +0.5%/level, capped at +50%. */
export function levelGtMultiplier(level: number): number {
  return 1 + Math.min(0.5, Math.max(0, level - 1) * 0.005);
}

// ---------- PRESTIGE (Phantom Ascension) ----------
// Prestige is earned by accumulating lifetime XP *beyond* the level cap, so it respects
// the "account level never resets" rule — nothing is wiped. Every PRESTIGE_XP of overflow
// XP past the cap grants one prestige star. Pure + unit-tested; the per-level XP step (500)
// is the same one xpForLevel() uses in lib/utils.ts.

/** Lifetime XP required to reach MAX_LEVEL (mirrors xpForLevel(MAX_LEVEL) in lib/utils.ts). */
export const LEVEL_CAP_XP = MAX_LEVEL * 500;

/** Overflow XP (past the cap) needed per prestige star — one full "climb to 100" again. */
export const PRESTIGE_XP = LEVEL_CAP_XP;

/** Prestige stars for a lifetime XP total: 0 until the cap, then +1 per PRESTIGE_XP of overflow. */
export function prestigeFromXp(xp: number): number {
  const overflow = xp - LEVEL_CAP_XP;
  if (overflow < PRESTIGE_XP) return 0;
  return Math.floor(overflow / PRESTIGE_XP);
}

/** GT earn multiplier granted by prestige: +2%/star, capped at +50% (25 stars). Stacks
 *  multiplicatively with levelGtMultiplier in the chat-award path. */
export function prestigeGtMultiplier(prestige: number): number {
  return 1 + Math.min(0.5, Math.max(0, prestige) * 0.02);
}

/**
 * Pick an index into `weights` with probability proportional to each weight
 * (weighted random — used by the Wheel of Fortune). `rng` is a [0,1) random
 * source, injectable so the selection can be unit-tested deterministically.
 * Negative weights are clamped to 0; a non-positive total returns index 0.
 */
export function pickWeightedIndex(weights: number[], rng: number): number {
  if (weights.length === 0) return 0;
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return 0;
  const clamped = Math.min(Math.max(rng, 0), 0.9999999);
  let target = clamped * total;
  for (let i = 0; i < weights.length; i++) {
    target -= Math.max(0, weights[i]);
    if (target < 0) return i;
  }
  return weights.length - 1;
}
