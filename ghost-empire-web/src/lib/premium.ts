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

/** Presentment currency. Ceny Elite w Stripe są TYLKO w PLN (decyzja produktowa 2026-07-16
 *  — nowe ceny 49/129/429 nie mają currency_options EUR/USD), więc oferta jest PLN-only. */
export const BILLING_CURRENCIES = ["pln"] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

export function isBillingCurrency(c: unknown): c is BillingCurrency {
  return c === "pln";
}

/** Display amounts in MINOR units (grosze/cents). Single source of truth for /premium.
 *  MUSZĄ zgadzać się co do grosza ze Stripe currency_options (checkout pobiera Price ID
 *  z env STRIPE_PRICE_ELITE_{1,3,12}M) — patrz krok wdrożenia w komentarzu wydania. */
export const PREMIUM_PRICE: Record<BillingCurrency, Record<PremiumMonths, number>> = {
  pln: { 1: 4900, 3: 12900, 12: 42900 }, // 49 / 129 / 429 zł (49,00 → 43,00 → 35,75/mies) — MUSI == Stripe
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

/** Default presentment currency. Oferta PLN-only (zob. BILLING_CURRENCIES). */
export function currencyForLocale(_locale: string): BillingCurrency {
  return "pln";
}
