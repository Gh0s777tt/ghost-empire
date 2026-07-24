// src/lib/refund.ts
// Pure, DB-free decision for how to reverse a shop purchase. A `spend` order can
// be paid in one of two currencies and refunding the WRONG one is a real-money
// leak: GT is the purchasable, cashable, per-tenant real-value economy, while
// CHIPS are the free, non-purchasable, non-cashable casino currency (see
// docs/CHIPS-CASINO.md). Crediting GT for a CHIPS order would mint real value out
// of nothing, and touching `totalSpent` for a CHIPS order would corrupt the GT
// economy metrics (weekly ranking / anomaly scan count only real GT). This module
// isolates that branch so it can be unit-tested without a database.

/** The two ledger currencies. GT = real-value economy; CHIPS = free casino currency. */
export type LedgerCurrency = "GT" | "CHIPS";

/**
 * A currency-correct plan for reversing a single `spend` transaction.
 *
 * @remarks
 * The three deltas are always **non-negative** magnitudes; the caller applies
 * them as Prisma `increment`/`decrement` on the matching {@link LedgerCurrency}
 * columns. Exactly one of `tokensDelta` / `chipsDelta` is non-zero, mirroring the
 * currency that was originally spent.
 */
export interface RefundPlan {
  /** True when the order was paid in free casino CHIPS (must never mint real GT). */
  isChips: boolean;
  /** Currency to stamp on the compensating refund `Transaction` row. */
  refundCurrency: LedgerCurrency;
  /** Amount to credit back to `User.tokens` (real GT). `0` for a CHIPS order. */
  tokensDelta: number;
  /** Amount to credit back to `User.chips` (free casino currency). `0` for a GT order. */
  chipsDelta: number;
  /**
   * Amount to roll back off `User.totalSpent`. `0` for a CHIPS order — chips carry
   * no real value and were never counted toward `totalSpent`, so decrementing it
   * would understate real GT spend and skew the economy metrics.
   */
  totalSpentDelta: number;
}

/**
 * Decide how to reverse a shop purchase based on the currency it was paid in.
 *
 * @param orderCurrency - `Transaction.currency` of the order being refunded.
 *   Anything other than the exact string `"CHIPS"` (including `"GT"`, `null`,
 *   `undefined`, or an unrecognised value) is treated as GT — matching how
 *   `shop/buy` derives `isChips` (`currency === "CHIPS"`), so the two paths can
 *   never disagree on what a row means.
 * @param refundAmount - The absolute amount to return (whole currency units, ≥ 0).
 *   The caller passes `Math.abs(tx.amount)`; negatives are clamped to `0` so a
 *   refund can never *debit* a balance.
 * @returns A {@link RefundPlan} the caller applies to the `User` row and the
 *   compensating refund `Transaction`.
 *
 * @example
 * ```ts
 * const plan = planRefund("CHIPS", 500);
 * // → { isChips: true, refundCurrency: "CHIPS",
 * //     tokensDelta: 0, chipsDelta: 500, totalSpentDelta: 0 }
 * ```
 */
export function planRefund(
  orderCurrency: string | null | undefined,
  refundAmount: number,
): RefundPlan {
  // Same rule as shop/buy: only the exact "CHIPS" sentinel is chips; everything
  // else is real GT. Bias toward GT would be dangerous, but the field is a
  // schema-defaulted enum-like string, so an unknown value means "legacy GT row".
  const isChips = orderCurrency === "CHIPS";
  // Guard the money magnitude: never let a malformed amount debit a balance.
  const amount = Number.isFinite(refundAmount) && refundAmount > 0 ? Math.trunc(refundAmount) : 0;

  return {
    isChips,
    refundCurrency: isChips ? "CHIPS" : "GT",
    tokensDelta: isChips ? 0 : amount,
    chipsDelta: isChips ? amount : 0,
    totalSpentDelta: isChips ? 0 : amount,
  };
}
