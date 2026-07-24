// src/lib/__tests__/billing.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { isBillingMonths, priceIdFor, periodEndToExpiry, billingConfigured, isActiveSubStatus, subscriptionUpdateData } from "../billing";

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

describe("isActiveSubStatus", () => {
  it("only active / trialing / past_due entitle the paid plan", () => {
    for (const s of ["active", "trialing", "past_due"]) expect(isActiveSubStatus(s)).toBe(true);
    for (const s of ["canceled", "incomplete", "incomplete_expired", "unpaid", "paused", ""]) expect(isActiveSubStatus(s)).toBe(false);
  });
});

describe("subscriptionUpdateData (Stripe subscription.updated → tenant fields)", () => {
  const END = 1_800_000_000;
  const expiry = periodEndToExpiry(END);

  it("active + non-basic sets BOTH plan and expiry", () => {
    expect(subscriptionUpdateData("active", "elite", END)).toEqual({ plan: "elite", planExpiresAt: expiry });
    expect(subscriptionUpdateData("trialing", "pro", END).plan).toBe("pro");
    expect(subscriptionUpdateData("past_due", "elite", END).plan).toBe("elite");
  });

  it("basic / garbage / null plan is NEVER set — but expiry still refreshes", () => {
    expect(subscriptionUpdateData("active", "basic", END)).toEqual({ planExpiresAt: expiry });
    expect(subscriptionUpdateData("active", "nonsense", END).plan).toBeUndefined();
    expect(subscriptionUpdateData("active", null, END).plan).toBeUndefined();
  });

  it("inactive sub does NOT set the plan (the .deleted event expires it) but still updates expiry", () => {
    const r = subscriptionUpdateData("canceled", "elite", END);
    expect(r.plan).toBeUndefined();
    expect(r.planExpiresAt).toEqual(expiry);
  });

  it("no period-end → no expiry field (absolute-set stays minimal)", () => {
    expect(subscriptionUpdateData("active", "elite", null)).toEqual({ plan: "elite" });
    expect(subscriptionUpdateData("canceled", "basic", null)).toEqual({});
  });
});
