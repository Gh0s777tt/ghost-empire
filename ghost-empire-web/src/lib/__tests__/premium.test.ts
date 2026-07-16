// src/lib/__tests__/premium.test.ts
import { describe, it, expect } from "vitest";
import {
  TRIAL_DAYS, PREMIUM_MONTHS, BILLING_CURRENCIES, PREMIUM_PRICE,
  isBillingCurrency, perMonthMinor, savingsPercent, formatMoney, currencyForLocale,
} from "../premium";

describe("premium offer constants", () => {
  it("trial is 14 days and periods are 1/3/12", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(PREMIUM_MONTHS).toEqual([1, 3, 12]);
    // Oferta PLN-only (2026-07-16): ceny Elite w Stripe są tylko w PLN.
    expect(BILLING_CURRENCIES).toEqual(["pln"]);
  });

  // Guard: te kwoty MUSZĄ lustrzeć ceny Stripe (STRIPE_PRICE_ELITE_{1,3,12}M).
  it("display prices mirror the Stripe amounts (minor units)", () => {
    expect(PREMIUM_PRICE).toEqual({
      pln: { 1: 4900, 3: 12900, 12: 42900 }, // 49 / 129 / 429 zł
    });
  });
});

describe("isBillingCurrency", () => {
  it("accepts only PLN", () => {
    expect(isBillingCurrency("pln")).toBe(true);
    expect(isBillingCurrency("eur")).toBe(false);
    expect(isBillingCurrency("usd")).toBe(false);
    expect(isBillingCurrency("PLN")).toBe(false);
    expect(isBillingCurrency(undefined)).toBe(false);
  });
});

describe("perMonthMinor / savingsPercent", () => {
  it("computes per-month equivalents", () => {
    expect(perMonthMinor("pln", 1)).toBe(4900);
    expect(perMonthMinor("pln", 3)).toBe(Math.round(12900 / 3)); // 4300
    expect(perMonthMinor("pln", 12)).toBe(Math.round(42900 / 12)); // 3575
  });
  it("monthly has no savings; longer periods discount vs monthly", () => {
    expect(savingsPercent("pln", 1)).toBe(0);
    expect(savingsPercent("pln", 3)).toBe(12);
    expect(savingsPercent("pln", 12)).toBe(27);
    for (const c of BILLING_CURRENCIES) expect(savingsPercent(c, 12)).toBeGreaterThan(0);
  });
});

describe("currencyForLocale", () => {
  it("always PLN (oferta PLN-only)", () => {
    expect(currencyForLocale("pl")).toBe("pln");
    expect(currencyForLocale("pl-PL")).toBe("pln");
    expect(currencyForLocale("en")).toBe("pln");
    expect(currencyForLocale("de")).toBe("pln");
  });
});

describe("formatMoney", () => {
  it("formats minor units as localized currency", () => {
    expect(formatMoney(4900, "pln", "pl")).toMatch(/49[.,]00/);
    expect(formatMoney(12900, "pln", "pl")).toMatch(/129[.,]00/);
    expect(formatMoney(42900, "pln", "pl")).toMatch(/429[.,]00/);
  });
});
