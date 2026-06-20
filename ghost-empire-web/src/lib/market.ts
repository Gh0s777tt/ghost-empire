// src/lib/market.ts
// Pure helpers for the P2P card marketplace (#552): price bounds + the sale fee that
// is burned (a GT sink, so trading doesn't inflate the supply). No server imports.

export const MARKET_MIN_PRICE = 1;
export const MARKET_MAX_PRICE = 1_000_000;
export const MARKET_FEE_PCT = 0.05; // 5% burned on each sale
export const MAX_ACTIVE_LISTINGS = 20; // per seller, anti-spam

/** Coerce a price to a whole number within [MIN, MAX]. */
export function clampPrice(n: number): number {
  const v = Math.floor(Number(n) || 0);
  return Math.max(MARKET_MIN_PRICE, Math.min(MARKET_MAX_PRICE, v));
}

/** GT burned on a sale (ceil, so the sink is never zero on a priced sale). */
export function marketFee(price: number): number {
  return Math.ceil(Math.max(0, price) * MARKET_FEE_PCT);
}

/** What the seller actually receives — price minus the burned fee. */
export function sellerProceeds(price: number): number {
  return Math.max(0, price - marketFee(price));
}
