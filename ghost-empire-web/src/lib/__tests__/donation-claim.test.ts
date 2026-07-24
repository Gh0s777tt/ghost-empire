// src/lib/__tests__/donation-claim.test.ts
import { describe, it, expect } from "vitest";
import { claimsForDonation, isValidAssertion, CLAIM_MAX_AGE_DAYS, type StoredClaim, type QueueDonation } from "@/lib/donation-claim";

const NOW = new Date("2026-07-20T12:00:00Z");
const d = (iso: string) => new Date(iso);

const donation: QueueDonation = {
  id: "don1",
  amountGrosze: 5000, // 50.00
  currency: "PLN",
  donatedAt: d("2026-07-19T10:00:00Z"),
};
const claim = (over: Partial<StoredClaim> = {}): StoredClaim => ({
  id: "c1",
  userId: "u1",
  amountGrosze: 5000,
  currency: "PLN",
  donatedOn: d("2026-07-19T00:00:00Z"),
  evidence: null,
  ...over,
});

describe("isValidAssertion", () => {
  const base = { amount: 50, currency: "PLN", donatedOn: d("2026-07-19T00:00:00Z") };
  it("accepts a sane, recent assertion", () => expect(isValidAssertion(base, NOW)).toBe(true));
  it("rejects junk amounts and currencies", () => {
    expect(isValidAssertion(null, NOW)).toBe(false);
    expect(isValidAssertion({ ...base, amount: 0 }, NOW)).toBe(false);
    expect(isValidAssertion({ ...base, amount: -5 }, NOW)).toBe(false);
    expect(isValidAssertion({ ...base, amount: NaN }, NOW)).toBe(false);
    expect(isValidAssertion({ ...base, currency: "P!N" }, NOW)).toBe(false);
    expect(isValidAssertion({ ...base, donatedOn: new Date("nope") }, NOW)).toBe(false);
  });
  it("rejects a future date and anything past the claim horizon", () => {
    expect(isValidAssertion({ ...base, donatedOn: d("2026-08-20T00:00:00Z") }, NOW)).toBe(false);
    const tooOld = new Date(NOW.getTime() - (CLAIM_MAX_AGE_DAYS + 2) * 24 * 3600 * 1000);
    expect(isValidAssertion({ ...base, donatedOn: tooOld }, NOW)).toBe(false);
  });
  it("tolerates a day of timezone slack around today", () => {
    expect(isValidAssertion({ ...base, donatedOn: d("2026-07-20T20:00:00Z") }, NOW)).toBe(true);
  });
});

describe("claimsForDonation", () => {
  it("matches an exact amount+currency inside the window", () => {
    expect(claimsForDonation(donation, [claim()])).toHaveLength(1);
  });

  it("does NOT match a different amount or currency (no fuzzy money matching)", () => {
    expect(claimsForDonation(donation, [claim({ amountGrosze: 5001 })])).toHaveLength(0);
    expect(claimsForDonation(donation, [claim({ currency: "USD" })])).toHaveLength(0);
  });

  it("is case-insensitive on currency codes", () => {
    expect(claimsForDonation(donation, [claim({ currency: "pln" })])).toHaveLength(1);
  });

  it("respects the date window in both directions", () => {
    expect(claimsForDonation(donation, [claim({ donatedOn: d("2026-07-17T00:00:00Z") })])).toHaveLength(1);
    expect(claimsForDonation(donation, [claim({ donatedOn: d("2026-07-25T00:00:00Z") })])).toHaveLength(0);
  });

  it("returns EVERY competing claim — contention must be visible, never silently first-come", () => {
    const hits = claimsForDonation(donation, [claim(), claim({ id: "c2", userId: "u2" })]);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.userId)).toEqual(["u1", "u2"]);
  });

  it("returns nothing when no claim fits", () => {
    expect(claimsForDonation(donation, [])).toHaveLength(0);
    expect(claimsForDonation(donation, [claim({ amountGrosze: 999 })])).toHaveLength(0);
  });
});
