// src/lib/gift.ts
// Pure helpers for P2P GT gifting (#553). Bounds per-transfer + per-day to limit abuse
// (gifting moves existing GT between viewers — it never creates supply — so the limits
// are about anti-spam / anti-laundering, not inflation). No server imports.

export const GIFT_MIN = 1;
export const GIFT_MAX_PER_TX = 5000;
export const GIFT_DAILY_LIMIT = 10000;

/** Coerce an amount to a whole number within [0, MAX_PER_TX]. */
export function clampGift(n: number): number {
  const v = Math.floor(Number(n) || 0);
  return Math.max(0, Math.min(GIFT_MAX_PER_TX, v));
}

/**
 * Why a gift can't go through (or null if it's fine). Pure so the route and any UI can
 * agree. `sentToday` is the GT already gifted by the sender in the rolling day.
 */
export function giftError(amount: number, balance: number, sentToday: number): "amount" | "insufficient" | "daily" | null {
  if (!Number.isFinite(amount) || amount < GIFT_MIN || amount > GIFT_MAX_PER_TX) return "amount";
  if (amount > balance) return "insufficient";
  if (sentToday + amount > GIFT_DAILY_LIMIT) return "daily";
  return null;
}
