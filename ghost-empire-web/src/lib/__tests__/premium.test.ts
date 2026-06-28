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
    expect(BILLING_CURRENCIES).toEqual(["pln", "eur", "usd"]);
  });

  // Guard: these MUST mirror the Stripe price currency_options created for #744.
  it("display prices mirror the Stripe amounts (minor units)", () => {
    expect(PREMIUM_PRICE).toEqual({
      pln: { 1: 1999, 3: 4999, 12: 14999 },
      eur: { 1: 499, 3: 1199, 12: 3499 },
      usd: { 1: 499, 3: 1299, 12: 3799 },
    });
  });
});

describe("isBillingCurrency", () => {
  it("accepts only the supported currencies", () => {
    expect(isBillingCurrency("pln")).toBe(true);
    expect(isBillingCurrency("eur")).toBe(true);
    expect(isBillingCurrency("usd")).toBe(true);
    expect(isBillingCurrency("gbp")).toBe(false);
    expect(isBillingCurrency("PLN")).toBe(false);
    expect(isBillingCurrency(undefined)).toBe(false);
  });
});

describe("perMonthMinor / savingsPercent", () => {
  it("computes per-month equivalents", () => {
    expect(perMonthMinor("pln", 1)).toBe(1999);
    expect(perMonthMinor("pln", 3)).toBe(Math.round(4999 / 3)); // 1666
    expect(perMonthMinor("pln", 12)).toBe(Math.round(14999 / 12)); // 1250
  });
  it("monthly has no savings; longer periods discount vs monthly", () => {
    expect(savingsPercent("pln", 1)).toBe(0);
    expect(savingsPercent("pln", 3)).toBe(17);
    expect(savingsPercent("pln", 12)).toBe(37);
    // every currency's yearly is cheaper per-month than its monthly
    for (const c of BILLING_CURRENCIES) expect(savingsPercent(c, 12)).toBeGreaterThan(0);
  });
});

describe("currencyForLocale", () => {
  it("maps UI locale to a sensible default currency", () => {
    expect(currencyForLocale("pl")).toBe("pln");
    expect(currencyForLocale("pl-PL")).toBe("pln");
    expect(currencyForLocale("en")).toBe("usd");
    expect(currencyForLocale("en-US")).toBe("usd");
    expect(currencyForLocale("de")).toBe("eur");
    expect(currencyForLocale("fr")).toBe("eur");
  });
});

describe("formatMoney", () => {
  it("formats minor units as localized currency", () => {
    expect(formatMoney(1999, "pln", "pl")).toMatch(/19[.,]99/);
    expect(formatMoney(499, "usd", "en")).toMatch(/4[.,]99/);
    expect(formatMoney(3499, "eur", "de")).toMatch(/34[.,]99/);
  });
});
