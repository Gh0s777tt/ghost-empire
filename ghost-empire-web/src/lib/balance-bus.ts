// src/lib/balance-bus.ts
// Tiny client-side "balance bus": whenever an API response carries the user's fresh GT
// balance (casino play, wheel spin, quest claim, shop buy, drop redeem, prediction
// wager…), the caller emits it here and the Header updates INSTANTLY — no waiting for
// the next session refetch. Values are always server-returned (authoritative), never
// computed client-side. No-op during SSR.
export const BALANCE_EVENT = "ge:balance";

export function emitBalance(balance: number) {
  if (typeof window === "undefined" || !Number.isFinite(balance)) return;
  window.dispatchEvent(new CustomEvent<number>(BALANCE_EVENT, { detail: balance }));
}
