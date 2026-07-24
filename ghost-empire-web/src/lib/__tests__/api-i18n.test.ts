// Unit tests for the pure error-message resolver behind jsonError (api-i18n.ts).
// Pure logic only (no cookies/DB) — the boundary wires locale (cookie) + tokenName
// (tenant) into resolveErrorMessage; here we test the translation + white-label
// substitution rules directly.
import { describe, it, expect } from "vitest";
import { resolveErrorMessage } from "@/lib/api-i18n";

describe("resolveErrorMessage — locale", () => {
  it("keeps Polish for a non-en locale", () => {
    expect(resolveErrorMessage("Musisz być zalogowany", { locale: "pl", tokenName: "Ghost Tokens" })).toBe(
      "Musisz być zalogowany",
    );
  });

  it("translates a known message to English", () => {
    expect(resolveErrorMessage("Musisz być zalogowany", { locale: "en", tokenName: "Ghost Tokens" })).toBe(
      "You must be logged in",
    );
  });

  it("falls through untranslated for an unknown / interpolated message", () => {
    expect(resolveErrorMessage("Wymagany Level 5", { locale: "en", tokenName: "Ghost Tokens" })).toBe(
      "Wymagany Level 5",
    );
  });
});

describe("resolveErrorMessage — %tokenName% white-label substitution", () => {
  it("substitutes the tenant currency in the Polish message", () => {
    expect(resolveErrorMessage("Za mało %tokenName%", { locale: "pl", tokenName: "Ghost Tokens" })).toBe(
      "Za mało Ghost Tokens",
    );
  });

  it("substitutes the tenant currency in the English translation", () => {
    expect(resolveErrorMessage("Za mało %tokenName%", { locale: "en", tokenName: "Ghost Tokens" })).toBe(
      "Not enough Ghost Tokens",
    );
  });

  it("never leaks the founder currency for a white-label tenant (PL + EN)", () => {
    const pl = resolveErrorMessage("Za mało %tokenName%", { locale: "pl", tokenName: "Sparks" });
    const en = resolveErrorMessage("Za mało %tokenName%", { locale: "en", tokenName: "Sparks" });
    expect(pl).toBe("Za mało Sparks");
    expect(en).toBe("Not enough Sparks");
    expect(pl).not.toContain("Ghost Tokens");
    expect(en).not.toContain("Ghost Tokens");
    expect(pl).not.toContain("%tokenName%");
    expect(en).not.toContain("%tokenName%");
  });

  it("substitutes inside an interpolated message even though it stays untranslated", () => {
    // The raffle route interpolates the needed amount, so the whole string isn't a
    // dictionary key → EN stays Polish, but the marker must still resolve.
    expect(resolveErrorMessage("Za mało %tokenName% (potrzeba 500)", { locale: "en", tokenName: "Sparks" })).toBe(
      "Za mało Sparks (potrzeba 500)",
    );
  });
});

describe("resolveErrorMessage — casino chips stay a universal currency", () => {
  it("keeps 'żetony' literal (not white-labeled) and translates it to 'chips'", () => {
    expect(resolveErrorMessage("Za mało żetonów", { locale: "pl", tokenName: "Sparks" })).toBe("Za mało żetonów");
    expect(resolveErrorMessage("Za mało żetonów", { locale: "en", tokenName: "Sparks" })).toBe("Not enough chips");
  });

  it("translates the wheel-spin chips message (realigned from GT to chips)", () => {
    expect(resolveErrorMessage("Za mało żetonów na zakręcenie", { locale: "en", tokenName: "Sparks" })).toBe(
      "Not enough chips to spin",
    );
  });
});
