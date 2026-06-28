// src/lib/premium.ts
// Pure (Stripe-free) premium-offer constants shared by the public /premium page
// (client) and the checkout route (server). Kept out of lib/billing.ts so the
// client bundle never pulls in the Stripe SDK. #744
//
// One "Premium" tier = the `elite` plan, three periods, multi-currency. The
// display amounts here MIRROR the Stripe price `currency_options` exactly — Stripe
// charges whatever currency checkout selects, so the page must show the same number.

/** Free trial granted on every premium checkout. */
export const TRIAL_DAYS = 14;

/** Periods offered on /premium (subset of billing's 1|3|6|12). */
export const PREMIUM_MONTHS = [1, 3, 12] as const;
export type PremiumMonths = (typeof PREMIUM_MONTHS)[number];

/** Presentment currencies. MUST match the Stripe price `currency_options`. */
export const BILLING_CURRENCIES = ["pln", "eur", "usd"] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

export function isBillingCurrency(c: unknown): c is BillingCurrency {
  return c === "pln" || c === "eur" || c === "usd";
}

/** Display amounts in MINOR units (grosze/cents). Single source of truth for /premium. */
export const PREMIUM_PRICE: Record<BillingCurrency, Record<PremiumMonths, number>> = {
  pln: { 1: 1999, 3: 4999, 12: 14999 },
  eur: { 1: 499, 3: 1199, 12: 3499 },
  usd: { 1: 499, 3: 1299, 12: 3799 },
};

/** Locale-aware money formatting from minor units (1999 → "19,99 zł" / "PLN 19.99"). */
export function formatMoney(minorUnits: number, currency: BillingCurrency, locale = "pl"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(minorUnits / 100);
}

/** Per-month minor-unit cost for a period (for "X / month" + savings vs the 1-month price). */
export function perMonthMinor(currency: BillingCurrency, months: PremiumMonths): number {
  return Math.round(PREMIUM_PRICE[currency][months] / months);
}

/** Savings % of a period vs paying monthly (0 for the 1-month plan). Rounded. */
export function savingsPercent(currency: BillingCurrency, months: PremiumMonths): number {
  if (months === 1) return 0;
  const monthly = PREMIUM_PRICE[currency][1];
  const effective = perMonthMinor(currency, months);
  return Math.max(0, Math.round((1 - effective / monthly) * 100));
}

/** Default presentment currency for a UI locale. */
export function currencyForLocale(locale: string): BillingCurrency {
  if (locale.startsWith("pl")) return "pln";
  if (locale.startsWith("en")) return "usd";
  return "eur";
}
