import { describe, it, expect } from "vitest";
import {
  CHIPS_ONLY_CATEGORY,
  ShopCurrencyError,
  assertCurrencyCategoryValid,
  checkCurrencyCategory,
  isChipsCurrency,
  normalizeShopCurrency,
} from "@/lib/shop-currency";

// Every real-value category in the shop (schema.prisma `ShopItem.category`, minus "cosmetic").
// A CHIPS item in ANY of these would let free casino chips buy something worth real money.
const REAL_VALUE_CATEGORIES = ["games", "skins", "subs", "experience"];

describe("normalizeShopCurrency / isChipsCurrency — sentinel parsing", () => {
  it("only the exact \"CHIPS\" sentinel is chips (mirrors shop/buy + planRefund)", () => {
    expect(normalizeShopCurrency("CHIPS")).toBe("CHIPS");
    expect(isChipsCurrency("CHIPS")).toBe(true);
    for (const raw of ["chips", "Chips", " CHIPS", "CHIPS ", "CHIP"]) {
      expect(normalizeShopCurrency(raw)).toBe("GT");
      expect(isChipsCurrency(raw)).toBe(false);
    }
  });

  it("treats null/undefined/unknown as GT (legacy rows are real GT — never free chips)", () => {
    for (const raw of [null, undefined, "", "GT", "gt", "PLN", "gold"] as const) {
      expect(normalizeShopCurrency(raw)).toBe("GT");
      expect(isChipsCurrency(raw)).toBe(false);
    }
  });
});

describe("checkCurrencyCategory — CHIPS ⇒ cosmetic (legal value-loop severance)", () => {
  it("allows the only legitimate chips pairing: CHIPS + cosmetic", () => {
    expect(checkCurrencyCategory("CHIPS", CHIPS_ONLY_CATEGORY)).toEqual({ ok: true });
    expect(checkCurrencyCategory("CHIPS", "cosmetic")).toEqual({ ok: true });
  });

  it("rejects CHIPS for EVERY real-value category", () => {
    for (const category of REAL_VALUE_CATEGORIES) {
      const check = checkCurrencyCategory("CHIPS", category);
      expect(check.ok, `CHIPS + ${category} must be rejected`).toBe(false);
      if (!check.ok) expect(check.error).toContain("cosmetic");
    }
  });

  it("is an allowlist: a category invented later is forbidden for chips by default", () => {
    // The point of allowlisting — adding "hardware"/"crypto"/… to VALID_CATEGORIES must not
    // silently re-open the value loop for chips.
    for (const category of ["hardware", "cash", "crypto", "COSMETIC", "cosmetics"]) {
      expect(checkCurrencyCategory("CHIPS", category).ok).toBe(false);
    }
  });

  it("rejects CHIPS with a missing/empty category (fail closed)", () => {
    expect(checkCurrencyCategory("CHIPS", null).ok).toBe(false);
    expect(checkCurrencyCategory("CHIPS", undefined).ok).toBe(false);
    expect(checkCurrencyCategory("CHIPS", "").ok).toBe(false);
  });

  it("leaves GT items unrestricted — real currency buying real value is the shop's job", () => {
    for (const category of [...REAL_VALUE_CATEGORIES, "cosmetic", "hardware"]) {
      expect(checkCurrencyCategory("GT", category)).toEqual({ ok: true });
    }
  });

  it("an unknown currency lands on the unrestricted GT branch, never bypasses the chips rule", () => {
    // Unknown ⇒ GT means the buyer is charged REAL currency; it can never let free chips
    // through a real-value item, which is the direction that would actually cost value.
    for (const currency of [null, undefined, "chips", "Chips", "???"]) {
      expect(checkCurrencyCategory(currency, "games")).toEqual({ ok: true });
    }
  });

  it("returns an admin-facing reason with no brand/token leak (white-label safe)", () => {
    const check = checkCurrencyCategory("CHIPS", "games");
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.error).toContain("games"); // says what was actually sent
      expect(check.error).not.toMatch(/Ghost Tokens|Ghost Empire|\bGT\b/);
    }
  });
});

describe("assertCurrencyCategoryValid — throwing form for seeds/scripts", () => {
  it("stays silent for allowed pairings", () => {
    expect(() => assertCurrencyCategoryValid("CHIPS", "cosmetic")).not.toThrow();
    expect(() => assertCurrencyCategoryValid("GT", "games")).not.toThrow();
    expect(() => assertCurrencyCategoryValid(undefined, "skins")).not.toThrow();
  });

  it("throws ShopCurrencyError carrying the check's reason", () => {
    expect(() => assertCurrencyCategoryValid("CHIPS", "subs")).toThrow(ShopCurrencyError);
    try {
      assertCurrencyCategoryValid("CHIPS", "subs");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ShopCurrencyError);
      expect((e as ShopCurrencyError).name).toBe("ShopCurrencyError");
      const expected = checkCurrencyCategory("CHIPS", "subs");
      expect(expected.ok).toBe(false);
      if (!expected.ok) expect((e as ShopCurrencyError).message).toBe(expected.error);
    }
  });
});
