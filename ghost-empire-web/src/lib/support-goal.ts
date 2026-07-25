// src/lib/support-goal.ts
// Progress math for the public /support fundraising bar (#goal-autotrack).
//
// WHY: `SupportGoal.current` was hand-typed, so the public bar was effectively fiction — real
// donations never moved it (they only bumped a SEPARATE `StreamGoal` of type "donations_pln"),
// which kills both trust and the urgency a goal is supposed to create. With `autoTrack` ON the bar
// is DERIVED from committed Donation rows since `startedAt`, plus `current` as a manual offset for
// off-platform gifts — so it cannot drift, and a webhook replay can't double-count it (the sum is
// recomputed from rows, never incremented).
//
// Currency: donations arrive in mixed currencies, so callers pass per-currency subtotals and we
// convert with `economy.plnFromCurrency` — the same flat, synthetic rate the existing
// `incrementGoals("donations_pln", …)` path already uses. That is fine for a PROGRESS INDICATOR;
// it is deliberately NOT used on receipts (see lib/email-receipts.ts), which must state the amount
// actually charged. Pure — no I/O; unit-tested.
import { plnFromCurrency } from "@/lib/economy";

/** One `groupBy(currency)` subtotal: minor units (grosze/cents) of donations in that currency. */
export type CurrencySubtotal = { currency: string; amountGrosze: number };

/**
 * Compute the goal's displayed progress in WHOLE currency units.
 *
 * @param manualOffset `SupportGoal.current` — off-platform/legacy amount to add on top.
 * @param subtotals per-currency donation sums (minor units) inside the goal window.
 * @param goalCurrency the goal's own currency; non-matching donations are converted via PLN.
 * @returns whole units, floored and never negative.
 * @remarks unit-tested in `__tests__/support-goal.test.ts`.
 */
export function goalProgress(
  manualOffset: number,
  subtotals: CurrencySubtotal[],
  goalCurrency = "PLN",
): number {
  const target = (goalCurrency || "PLN").toUpperCase();
  let minor = 0;
  for (const s of subtotals) {
    const amount = Number(s.amountGrosze);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const cur = (s.currency || "PLN").toUpperCase();
    if (cur === target) {
      minor += amount;
    } else {
      // Convert to PLN (the only rate we have). If the goal itself isn't PLN we can't do better
      // than a PLN-equivalent — documented above; goals are PLN by default.
      minor += plnFromCurrency(amount, cur);
    }
  }
  const whole = Math.floor(minor / 100) + Math.floor(Number.isFinite(manualOffset) ? manualOffset : 0);
  return Math.max(0, whole);
}
