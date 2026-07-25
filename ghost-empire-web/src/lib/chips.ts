// src/lib/chips.ts
// How an amount of money is LABELLED — one place, because getting the label wrong is both a
// white-label leak and a legal-framing bug.
//
// Two currencies flow through the same alert/overlay pipeline (docs/CHIPS-CASINO.md):
//   • GT — the portal's real economy. Per-tenant by definition: every viewer-facing surface must
//     show the active tenant's own `tokenSymbol`, never the founder tenant's literal "GT".
//   • Żetony / `chips` — the free, non-purchasable, non-cashable casino currency. Deliberately
//     identical on every portal (it belongs to no one's brand), so it always renders as 🪙.
//     Labelling a chips amount with a token symbol would imply the free currency carries the
//     token's real value — exactly the value loop the chips split exists to cut.
//
// Dependency-free on purpose so both server routes and client components can import it.

/** Symbol rendered next to a chips amount. Never white-labelled — see the file header. */
export const CHIP_SYMBOL = "🪙";

/** Currency an amount is denominated in (`Transaction.currency` / `ShopItem.currency`). */
export type Currency = "GT" | "CHIPS";

/**
 * Label for an amount, in the currency it was actually charged/paid in.
 *
 * @param currency - Currency the amount moved in; `"CHIPS"` → casino chips, otherwise tokens.
 * @param tokenSymbol - The active tenant's `tokenSymbol` (from `getCurrentTenant()`), i.e. this
 *   portal's own symbol for GT. Never pass a hardcoded `"GT"` — that is the white-label leak.
 * @returns The symbol to render next to the amount (stream-alert `amountLabel`, overlay, …).
 *
 * @example
 * amountLabelFor("CHIPS", "NEO"); // "🪙"  — the same on every portal
 * amountLabelFor("GT", "NEO");    // "NEO" — this portal's own token
 */
export function amountLabelFor(currency: Currency, tokenSymbol: string): string {
  return currency === "CHIPS" ? CHIP_SYMBOL : tokenSymbol;
}
