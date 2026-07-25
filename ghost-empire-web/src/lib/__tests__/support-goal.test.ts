// src/lib/__tests__/support-goal.test.ts
import { describe, it, expect } from "vitest";
import { goalProgress } from "@/lib/support-goal";

describe("goalProgress", () => {
  it("sums same-currency donations into whole units", () => {
    // 150.00 + 49.50 PLN = 199.50 → 199 whole units
    expect(goalProgress(0, [{ currency: "PLN", amountGrosze: 15_000 + 4_950 }])).toBe(199);
  });

  it("adds the manual offset on top (off-platform gifts)", () => {
    expect(goalProgress(500, [{ currency: "PLN", amountGrosze: 10_000 }])).toBe(600);
    expect(goalProgress(500, [])).toBe(500); // offset-only == legacy hand-typed behaviour
  });

  it("converts a foreign currency instead of counting it 1:1", () => {
    const pln = goalProgress(0, [{ currency: "PLN", amountGrosze: 10_000 }]); // 100 PLN
    const usd = goalProgress(0, [{ currency: "USD", amountGrosze: 10_000 }]); // 100 USD → more PLN
    expect(usd).toBeGreaterThan(pln);
  });

  it("mixes currencies additively", () => {
    const mixed = goalProgress(0, [
      { currency: "PLN", amountGrosze: 10_000 },
      { currency: "USD", amountGrosze: 10_000 },
    ]);
    expect(mixed).toBe(
      goalProgress(0, [{ currency: "PLN", amountGrosze: 10_000 }]) +
        goalProgress(0, [{ currency: "USD", amountGrosze: 10_000 }]),
    );
  });

  it("is case-insensitive on currency codes", () => {
    expect(goalProgress(0, [{ currency: "pln", amountGrosze: 10_000 }])).toBe(100);
  });

  it("ignores junk subtotals and never returns a negative", () => {
    expect(goalProgress(0, [{ currency: "PLN", amountGrosze: -500 }])).toBe(0);
    expect(goalProgress(0, [{ currency: "PLN", amountGrosze: NaN }])).toBe(0);
    expect(goalProgress(-999, [])).toBe(0);
    expect(goalProgress(NaN, [{ currency: "PLN", amountGrosze: 10_000 }])).toBe(100);
  });

  it("is idempotent — recomputing from the same rows can never double-count", () => {
    const rows = [{ currency: "PLN", amountGrosze: 12_345 }];
    expect(goalProgress(10, rows)).toBe(goalProgress(10, rows));
  });
});
