import { describe, it, expect } from "vitest";
import { planRefund } from "@/lib/refund";

describe("planRefund — currency branch (money-critical)", () => {
  it("GT order: credits real tokens AND rolls back totalSpent", () => {
    const plan = planRefund("GT", 250);
    expect(plan).toEqual({
      isChips: false,
      refundCurrency: "GT",
      tokensDelta: 250,
      chipsDelta: 0,
      totalSpentDelta: 250,
    });
  });

  it("CHIPS order: credits free chips only — NEVER mints GT, NEVER touches totalSpent", () => {
    const plan = planRefund("CHIPS", 500);
    expect(plan).toEqual({
      isChips: true,
      refundCurrency: "CHIPS",
      tokensDelta: 0,
      chipsDelta: 500,
      totalSpentDelta: 0,
    });
    // The whole point of the fix: refunding chips must not create real value.
    expect(plan.tokensDelta).toBe(0);
    expect(plan.totalSpentDelta).toBe(0);
  });

  it("treats null/undefined/unknown currency as GT (legacy rows are real GT)", () => {
    for (const c of [null, undefined, "gt", "gold", ""] as const) {
      const plan = planRefund(c, 10);
      expect(plan.isChips).toBe(false);
      expect(plan.refundCurrency).toBe("GT");
      expect(plan.tokensDelta).toBe(10);
      expect(plan.chipsDelta).toBe(0);
    }
  });

  it("only the exact \"CHIPS\" sentinel is chips (case-sensitive, mirrors shop/buy)", () => {
    expect(planRefund("chips", 10).isChips).toBe(false);
    expect(planRefund("Chips", 10).isChips).toBe(false);
    expect(planRefund("CHIPS", 10).isChips).toBe(true);
  });

  it("clamps malformed amounts to 0 so a refund can never debit a balance", () => {
    for (const bad of [-5, NaN, Infinity, -Infinity]) {
      const plan = planRefund("GT", bad);
      expect(plan.tokensDelta).toBe(0);
      expect(plan.totalSpentDelta).toBe(0);
    }
    expect(planRefund("CHIPS", -1).chipsDelta).toBe(0);
  });

  it("truncates fractional amounts to whole currency units", () => {
    expect(planRefund("GT", 12.9).tokensDelta).toBe(12);
    expect(planRefund("CHIPS", 7.5).chipsDelta).toBe(7);
  });
});
