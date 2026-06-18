// src/lib/economy-health.ts
// Pure helpers for the GT economy-health dashboard. The platform has many GT
// FAUCETS (chat, subs, donations, quests, games-won) and fewer SINKS (shop,
// predictions lost, casino bet). If faucets outpace sinks over time the GT
// supply inflates and tokens lose value — this surfaces the source/sink balance
// so the streamer can tune rewards/prices. Pure + unit-tested; the request-time
// aggregation lives in /api/admin/economy-health.

export type FlowKind = "faucet" | "sink";

/** A transaction MINTS GT when its signed amount is positive, BURNS when negative. */
export function flowKind(amount: number): FlowKind {
  return amount >= 0 ? "faucet" : "sink";
}

export type EconomyStatus = "inflating" | "healthy" | "contracting";

export type EconomyHealth = {
  /** burned / minted over the window. 0 = pure faucet, ≥1 = sinks outweigh faucets. */
  burnRatio: number;
  status: EconomyStatus;
};

/**
 * Classify the window's mint-vs-burn balance from the two positive magnitudes.
 *  - ratio < 0.5      → faucets dominate, GT supply inflating fast
 *  - 0.5 ≤ ratio < 0.9 → healthy circulation
 *  - ratio ≥ 0.9      → sinks keep pace / contract the supply
 * No activity (minted = burned = 0) reports as `healthy` (nothing to inflate).
 */
export function economyHealth(minted: number, burned: number): EconomyHealth {
  if (minted <= 0 && burned <= 0) return { burnRatio: 0, status: "healthy" };
  const burnRatio = minted > 0 ? burned / minted : Infinity;
  const status: EconomyStatus = burnRatio < 0.5 ? "inflating" : burnRatio < 0.9 ? "healthy" : "contracting";
  return { burnRatio, status };
}
