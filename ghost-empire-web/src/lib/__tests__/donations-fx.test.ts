// src/lib/__tests__/donations-fx.test.ts
import { describe, it, expect } from "vitest";
import { plnFromMinor, minorFromMajor, isSupportedCurrency, currencyDecimals, MAX_AMOUNT_MINOR } from "@/lib/donations/fx";

describe("isSupportedCurrency", () => {
  it("accepts known codes case-insensitively, refuses the rest", () => {
    expect(isSupportedCurrency("PLN")).toBe(true);
    expect(isSupportedCurrency("jpy")).toBe(true);
    expect(isSupportedCurrency("XYZ")).toBe(false);
    expect(isSupportedCurrency("")).toBe(false);
  });
});

describe("plnFromMinor", () => {
  it("converts PLN 1:1", () => {
    expect(plnFromMinor(2500, "PLN")).toBe(25);
  });

  it("uses a REAL rate, not a flat multiplier — the 160x over-mint regression", () => {
    // ¥1000 is ~27 PLN. The old flat x4 turned this into 4000 PLN (~160x too much GT).
    const pln = plnFromMinor(1000, "JPY"); // JPY is zero-decimal: 1000 minor == ¥1000
    expect(pln).toBeCloseTo(27, 0);
    expect(pln!).toBeLessThan(50);
  });

  it("respects zero-decimal currencies", () => {
    expect(currencyDecimals("JPY")).toBe(0);
    expect(currencyDecimals("PLN")).toBe(2);
    // 100 minor units: ¥100 (~2.7 PLN) vs 1.00 PLN
    expect(plnFromMinor(100, "JPY")!).toBeCloseTo(2.7, 1);
    expect(plnFromMinor(100, "PLN")).toBe(1);
  });

  it("scales low-value currencies DOWN instead of up", () => {
    expect(plnFromMinor(10_000, "CZK")!).toBeLessThan(plnFromMinor(10_000, "PLN")!);
    expect(plnFromMinor(10_000, "SEK")!).toBeLessThan(plnFromMinor(10_000, "EUR")!);
  });

  it("returns NULL for an unknown currency — never guesses a rate", () => {
    expect(plnFromMinor(10_000, "XYZ")).toBeNull();
    expect(plnFromMinor(10_000, "")).toBeNull();
  });

  it("returns 0 for non-positive input", () => {
    expect(plnFromMinor(0, "PLN")).toBe(0);
    expect(plnFromMinor(-5, "PLN")).toBe(0);
    expect(plnFromMinor(NaN, "PLN")).toBe(0);
  });
});

describe("minorFromMajor", () => {
  it("uses the currency exponent (JPY 1000 -> 1000, PLN 25 -> 2500)", () => {
    expect(minorFromMajor("1000", "JPY")).toBe(1000);
    expect(minorFromMajor("25.00", "PLN")).toBe(2500);
    expect(minorFromMajor("19,99", "EUR")).toBe(1999); // comma decimal
  });
  it("rejects nonsense and overflow rather than passing it to an int4 column", () => {
    for (const bad of [0, -1, NaN, "abc", null, undefined]) expect(minorFromMajor(bad as unknown, "PLN")).toBe(0);
    expect(minorFromMajor(MAX_AMOUNT_MINOR, "PLN")).toBe(0); // *100 would overflow
  });
});
