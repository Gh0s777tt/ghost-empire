// src/lib/__tests__/billing.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { isBillingMonths, priceIdFor, periodEndToExpiry, billingConfigured } from "../billing";

describe("isBillingMonths", () => {
  it("accepts only the offered durations", () => {
    expect(isBillingMonths(1)).toBe(true);
    expect(isBillingMonths(3)).toBe(true);
    expect(isBillingMonths(6)).toBe(true);
    expect(isBillingMonths(12)).toBe(true);
    expect(isBillingMonths(2)).toBe(false);
    expect(isBillingMonths("3")).toBe(false);
    expect(isBillingMonths(undefined)).toBe(false);
  });
});

describe("priceIdFor / billingConfigured (env-mapped)", () => {
  afterEach(() => {
    delete process.env.STRIPE_PRICE_PRO_3M;
  });
  it("reads the env id and returns null for unset combos", () => {
    expect(priceIdFor("pro", 3)).toBeNull();
    process.env.STRIPE_PRICE_PRO_3M = "price_test_123";
    expect(priceIdFor("pro", 3)).toBe("price_test_123");
    expect(priceIdFor("elite", 12)).toBeNull();
  });
  it("billingConfigured follows STRIPE_SECRET_KEY presence", () => {
    // The test env has no Stripe key — dry-wired default.
    expect(billingConfigured()).toBe(false);
  });
});

describe("periodEndToExpiry", () => {
  it("converts unix seconds and adds the renewal grace", () => {
    const end = 1_800_000_000; // unix seconds
    const d = periodEndToExpiry(end);
    expect(d.getTime()).toBe(end * 1000 + 24 * 60 * 60 * 1000);
    expect(periodEndToExpiry(end, 0).getTime()).toBe(end * 1000);
  });
});
