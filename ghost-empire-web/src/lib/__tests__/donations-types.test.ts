// src/lib/__tests__/donations-types.test.ts
import { describe, it, expect } from "vitest";
import {
  externalIdFor, syntheticExternalId, toMinor, normalizeCurrency, clampText,
} from "@/lib/donations/types";

describe("externalIdFor", () => {
  it("namespaces by provider so two providers can't collide", () => {
    expect(externalIdFor("kofi", "abc")).toBe("kofi:abc");
    expect(externalIdFor("tipply", "abc")).toBe("tipply:abc");
    expect(externalIdFor("kofi", "abc")).not.toBe(externalIdFor("tipply", "abc"));
  });
  it("is idempotent when the id is already namespaced", () => {
    expect(externalIdFor("kofi", "kofi:abc")).toBe("kofi:abc");
  });
  it("trims runaway ids", () => {
    expect(externalIdFor("custom", "x".repeat(500)).length).toBeLessThanOrEqual(187);
  });
});

describe("syntheticExternalId", () => {
  const base = { donorName: "Ala", amountMinor: 5000, currency: "PLN", donatedAt: new Date("2026-07-20T10:00:00Z") };
  it("is stable for identical input (a retry dedupes)", () => {
    expect(syntheticExternalId("tipply", base)).toBe(syntheticExternalId("tipply", base));
  });
  it("differs on amount, currency, donor or second", () => {
    expect(syntheticExternalId("tipply", { ...base, amountMinor: 5001 })).not.toBe(syntheticExternalId("tipply", base));
    expect(syntheticExternalId("tipply", { ...base, currency: "EUR" })).not.toBe(syntheticExternalId("tipply", base));
    expect(syntheticExternalId("tipply", { ...base, donorName: "Ola" })).not.toBe(syntheticExternalId("tipply", base));
    expect(syntheticExternalId("tipply", { ...base, donatedAt: new Date("2026-07-20T10:00:01Z") })).not.toBe(syntheticExternalId("tipply", base));
  });
  it("ignores donor-name case and padding (same donation, different formatting)", () => {
    expect(syntheticExternalId("tipply", { ...base, donorName: "  ALA " })).toBe(syntheticExternalId("tipply", base));
  });
});

describe("toMinor", () => {
  it("converts major units to minor", () => {
    expect(toMinor(25)).toBe(2500);
    expect(toMinor("19.99")).toBe(1999);
    expect(toMinor("19,99")).toBe(1999); // comma decimal (PL formatting)
  });
  it("passes through values already in minor units", () => {
    expect(toMinor(2500, { alreadyMinor: true })).toBe(2500);
  });
  it("returns 0 for non-positive / nonsense / overflow (never mints from garbage)", () => {
    for (const bad of [0, -5, NaN, Infinity, null, undefined, "", "abc", {}]) {
      expect(toMinor(bad as unknown)).toBe(0);
    }
    expect(toMinor(Number.MAX_SAFE_INTEGER)).toBe(0);
  });
});

describe("normalizeCurrency", () => {
  it("upper-cases valid codes and defaults to PLN otherwise", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency(" eur ")).toBe("EUR");
    expect(normalizeCurrency("")).toBe("PLN");
    expect(normalizeCurrency("$$")).toBe("PLN");
    expect(normalizeCurrency(null)).toBe("PLN");
  });
});

describe("clampText", () => {
  it("trims, caps and nulls empties", () => {
    expect(clampText("  hi  ", 10)).toBe("hi");
    expect(clampText("", 10)).toBeNull();
    expect(clampText(42, 10)).toBeNull();
    expect(clampText("x".repeat(50), 10)).toHaveLength(10);
  });
});
