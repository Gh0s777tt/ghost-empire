// src/lib/__tests__/i18n-branding.test.ts
import { describe, it, expect } from "vitest";
import { applyTokenBranding } from "../i18n-branding";

const B = { tokenName: "Neo Coins", tokenSymbol: "NC" };

describe("applyTokenBranding", () => {
  it("replaces both markers in nested objects and arrays", () => {
    const out = applyTokenBranding(
      {
        a: "Zdobywasz %tokenName% za czat",
        b: { c: "Saldo: 500 %gt%", d: ["%gt%", "x %tokenName% y"] },
      },
      B,
    );
    expect(out.a).toBe("Zdobywasz Neo Coins za czat");
    expect(out.b.c).toBe("Saldo: 500 NC");
    expect(out.b.d).toEqual(["NC", "x Neo Coins y"]);
  });

  it("replaces multiple occurrences in one string", () => {
    expect(applyTokenBranding("%gt% + %gt% = 2 %gt%", B)).toBe("NC + NC = 2 NC");
  });

  it("leaves ICU placeholders and plain strings untouched", () => {
    expect(applyTokenBranding("Masz {count} biletów", B)).toBe("Masz {count} biletów");
    expect(applyTokenBranding("100% pewności", B)).toBe("100% pewności");
  });

  it("passes through non-strings", () => {
    expect(applyTokenBranding(42 as unknown as string, B)).toBe(42);
    expect(applyTokenBranding(null as unknown as string, B)).toBeNull();
  });
});
