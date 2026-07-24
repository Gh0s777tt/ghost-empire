// QA: etykieta kwoty per waluta (docs/CHIPS-CASINO.md + reguła white-label z CLAUDE.md).
// Dwa kontrakty, oba realnie złamane wcześniej przez zahardkodowane "GT" w alertach:
//   1) GT → ZAWSZE symbol tenanta (nigdy literalne "GT" założyciela) — biały-label,
//   2) CHIPS → ZAWSZE 🪙, identycznie na każdym portalu (żetony nie należą do brandu;
//      podpisanie ich symbolem tokena sugerowałoby, że mają jego realną wartość).
import { describe, it, expect } from "vitest";
import { amountLabelFor, CHIP_SYMBOL } from "@/lib/chips";

describe("amountLabelFor", () => {
  it("labels GT with the tenant's own symbol, never a hardcoded 'GT'", () => {
    expect(amountLabelFor("GT", "NEO")).toBe("NEO");
    expect(amountLabelFor("GT", "★")).toBe("★");
  });

  it("keeps the founder tenant working (its symbol just happens to be GT)", () => {
    expect(amountLabelFor("GT", "GT")).toBe("GT");
  });

  it("labels CHIPS with 🪙 on EVERY portal — the tenant symbol must not leak in", () => {
    expect(amountLabelFor("CHIPS", "NEO")).toBe(CHIP_SYMBOL);
    expect(amountLabelFor("CHIPS", "GT")).toBe(CHIP_SYMBOL);
    expect(amountLabelFor("CHIPS", "")).toBe(CHIP_SYMBOL);
  });

  it("chip symbol is the documented 🪙 (kasyno/koło UI render the same glyph)", () => {
    expect(CHIP_SYMBOL).toBe("🪙");
  });
});
