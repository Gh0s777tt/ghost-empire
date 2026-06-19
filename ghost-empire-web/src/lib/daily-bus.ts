// src/lib/daily-bus.ts
// Tiny client-side "daily bonus bus": the daily bonus can be claimed from the
// homepage card OR the header indicator. Whichever claims emits here so the other
// updates instantly (no refetch, no double "claim" button lingering). Mirrors
// balance-bus. No-op during SSR. detail = the new streak count.
export const DAILY_CLAIMED_EVENT = "ge:daily-claimed";

export function emitDailyClaimed(streak: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<number>(DAILY_CLAIMED_EVENT, { detail: streak }));
}
