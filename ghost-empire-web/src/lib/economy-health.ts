// src/lib/economy-health.ts
// Pure helpers for the economy-health dashboard. The platform has many GT
// FAUCETS (chat, subs, donations, quests, games-won) and fewer SINKS (shop,
// predictions lost, casino bet). If faucets outpace sinks over time the GT
// supply inflates and tokens lose value — this surfaces the source/sink balance
// so the streamer can tune rewards/prices. Pure + unit-tested; the request-time
// aggregation lives in /api/admin/economy-health.
//
// The dashboard reports TWO independent loops — real GT and the free casino CHIPS —
// side by side but never mixed (docs/CHIPS-CASINO.md): chips are handed out for free, so
// folding them into the GT numbers would read as economic activity that never happened.
// The helpers below bucket one ledger read per currency so both loops come from the same
// query without either polluting the other.
import { normalizeShopCurrency, type ShopCurrency } from "@/lib/shop-currency";

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

/** A ledger aggregate row tagged with the currency it belongs to (one groupBy bucket). */
export type CurrencyFlowRow = { currency: string | null; total: number; count: number };

/** Totals for a single currency over the dashboard's window. */
export type CurrencyFlow = { total: number; count: number };

/**
 * Pick one currency's slice out of a `groupBy(["currency", …])` result.
 *
 * @param rows - Aggregate buckets; several rows may share a currency when the query groups
 *   by more than one key (e.g. currency + reason), so matches are summed rather than found.
 * @param currency - Which ledger loop to total up.
 * @returns Summed `total` (signed, as stored) and row `count`; zeroes when nothing matched.
 *
 * @remarks
 * Buckets are matched through {@link normalizeShopCurrency}, so a legacy/unknown currency
 * string counts as GT — the same reading every other consumer uses (`shop/buy`, `planRefund`,
 * the anomaly detector). Matching the raw string instead would silently drop such rows from
 * the GT totals and understate the real economy.
 */
export function flowForCurrency(rows: CurrencyFlowRow[], currency: ShopCurrency): CurrencyFlow {
  let total = 0;
  let count = 0;
  for (const r of rows) {
    if (normalizeShopCurrency(r.currency) !== currency) continue;
    total += r.total;
    count += r.count;
  }
  return { total, count };
}

/** A per-reason flow bucket ("shop:Klucz Steam" → −100 000 over 3 transactions). */
export type ReasonFlow = { reason: string; total: number; count: number };

/**
 * Split per-reason buckets into the biggest faucets and the biggest sinks.
 *
 * @param reasons - Per-reason totals for ONE currency (signed: positive mints, negative burns).
 * @param topN - How many rows to keep on each side.
 * @returns `sources` (positive, descending) and `sinks` (magnitudes, descending) — sink totals
 *   are returned as positive numbers because the UI renders them as bar lengths.
 */
export function splitSourcesSinks(reasons: ReasonFlow[], topN: number): { sources: ReasonFlow[]; sinks: ReasonFlow[] } {
  const sources = reasons
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, topN);
  const sinks = reasons
    .filter((r) => r.total < 0)
    .map((r) => ({ ...r, total: Math.abs(r.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topN);
  return { sources, sinks };
}
