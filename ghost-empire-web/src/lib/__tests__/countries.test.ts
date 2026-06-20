import { describe, it, expect } from "vitest";
import { countryFlag, isCountryCode, COUNTRY_CODES } from "@/lib/countries";

describe("countryFlag", () => {
  it("maps an ISO-2 code to its regional-indicator flag", () => {
    expect(countryFlag("PL")).toBe(String.fromCodePoint(0x1f1f5, 0x1f1f1));
    expect(countryFlag("US")).toBe(String.fromCodePoint(0x1f1fa, 0x1f1f8));
  });

  it("is case-insensitive", () => {
    expect(countryFlag("pl")).toBe(countryFlag("PL"));
  });

  it("returns empty string for invalid input", () => {
    for (const bad of [null, undefined, "", "P", "POL", "1A", "🇵🇱"]) expect(countryFlag(bad)).toBe("");
  });
});

describe("isCountryCode", () => {
  it("accepts known codes (any case)", () => {
    expect(isCountryCode("PL")).toBe(true);
    expect(isCountryCode("us")).toBe(true);
  });

  it("rejects unknown / malformed codes", () => {
    for (const bad of ["", "ZZ", "XX", "PLN", "P"]) expect(isCountryCode(bad)).toBe(false);
  });

  it("every listed code produces a non-empty flag", () => {
    for (const c of COUNTRY_CODES) expect(countryFlag(c).length).toBeGreaterThan(0);
  });
});
