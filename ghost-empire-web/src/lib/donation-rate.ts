// src/lib/donation-rate.ts
// SINGLE source of the real-money→GT rate and the per-donation cap, shared by EVERY money-in rail
// (PayMedia webhook, Streamlabs poll, YouTube superchats). Before this, each rail read its own env
// (PAYMEDIA_GT_PER_PLN / DONATION_GT_PER_PLN / a hardcoded 100) — so setting one silently desynced
// the rails and could break the advertised "1 PLN = 100 GT" promise. Env is read once here; the
// pure math (gtFromPln) is unit-tested. Old env vars are still honoured as fallbacks (no migration).
const RAW = parseInt(
  process.env.GT_PER_PLN ?? process.env.DONATION_GT_PER_PLN ?? process.env.PAYMEDIA_GT_PER_PLN ?? "100",
  10,
);

/** GT minted per 1 PLN donated — one value for all ingress rails (default 100, guarded against NaN/≤0). */
export const GT_PER_PLN = Number.isFinite(RAW) && RAW > 0 ? RAW : 100;

/** Cap one donation's GT at ~100k PLN-equivalent so a malformed/huge upstream amount can't mint absurd GT. */
export const MAX_DONATION_GT = GT_PER_PLN * 100_000;

/**
 * GT for a PLN amount — rounded and capped. Use on EVERY money-in rail so a bad upstream value
 * (negative, NaN, or an enormous mis-parsed amount) can never mint out-of-band GT.
 * @param pln PLN already converted from the donation's source currency (see economy.plnFromCurrency).
 */
export function gtFromPln(pln: number, rate: number = GT_PER_PLN, cap: number = MAX_DONATION_GT): number {
  if (!Number.isFinite(pln) || pln <= 0) return 0;
  return Math.min(Math.round(pln * rate), cap);
}
