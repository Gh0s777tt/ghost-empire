// Unit tests for the pure ledger-reconciliation logic (no DB). Covers the invariant math, the
// dedup decision, the offenders union/sort/cap, and the alert summary.
import { describe, it, expect } from "vitest";
import { currencyDrift, shouldAlert, findOffenders, driftSummary } from "@/lib/reconcile";

describe("currencyDrift", () => {
  it("drift = balance − ledger; healthy books reconcile to 0", () => {
    expect(currencyDrift("GT", 1000, 1000)).toEqual({ currency: "GT", balance: 1000, ledger: 1000, drift: 0 });
  });
  it("positive drift = balance minted without a ledger row", () => {
    expect(currencyDrift("GT", 1500, 1000).drift).toBe(500);
  });
  it("negative drift = ledger burn not reflected in balance", () => {
    expect(currencyDrift("CHIPS", 800, 1000).drift).toBe(-200);
  });
  it("coalesces nullish Prisma _sum to 0 (empty portal is healthy, not NaN)", () => {
    expect(currencyDrift("GT", null, undefined)).toEqual({ currency: "GT", balance: 0, ledger: 0, drift: 0 });
    expect(currencyDrift("CHIPS", 50, null).drift).toBe(50);
  });
});

describe("shouldAlert (dedup vs previous run)", () => {
  it("never alerts when the books reconcile", () => {
    expect(shouldAlert(0, null)).toBe(false);
    expect(shouldAlert(0, 500)).toBe(false); // drift resolved back to 0 → no alarm (caller logs recovery)
  });
  it("alerts on first sight of a nonzero drift (last === null)", () => {
    expect(shouldAlert(500, null)).toBe(true);
  });
  it("stays quiet on a stable baseline drift (unchanged since last run)", () => {
    expect(shouldAlert(500, 500)).toBe(false);
  });
  it("re-alerts when the drift changes (grew or shrank but still nonzero)", () => {
    expect(shouldAlert(700, 500)).toBe(true);
    expect(shouldAlert(300, 500)).toBe(true);
    expect(shouldAlert(-500, 500)).toBe(true);
  });
});

describe("findOffenders", () => {
  it("returns only users whose balance disagrees with their ledger, worst |drift| first", () => {
    const bal = new Map([["a", 100], ["b", 50], ["c", 200]]);
    const led = new Map([["a", 100], ["b", 10], ["c", 500]]);
    const out = findOffenders(bal, led, 10);
    expect(out).toEqual([
      { userId: "c", balance: 200, ledger: 500, drift: -300 }, // |300| first
      { userId: "b", balance: 50, ledger: 10, drift: 40 },
    ]);
    expect(out.find((o) => o.userId === "a")).toBeUndefined(); // reconciled → omitted
  });
  it("counts the union of both maps: balance-only and ledger-only users are inconsistencies", () => {
    const bal = new Map([["onlyBal", 90]]);
    const led = new Map([["onlyLed", 70]]);
    const out = findOffenders(bal, led, 10);
    expect(out).toEqual([
      { userId: "onlyBal", balance: 90, ledger: 0, drift: 90 },
      { userId: "onlyLed", balance: 0, ledger: 70, drift: -70 },
    ]);
  });
  it("caps the result at topN", () => {
    const bal = new Map([["a", 5], ["b", 4], ["c", 3]]);
    const led = new Map<string, number>();
    expect(findOffenders(bal, led, 2)).toHaveLength(2);
  });
});

describe("driftSummary", () => {
  it("mentions only drifting currencies and signs the drift", () => {
    const s = driftSummary([
      { currency: "GT", balance: 1500, ledger: 1000, drift: 500 },
      { currency: "CHIPS", balance: 200, ledger: 200, drift: 0 },
    ]);
    expect(s).toContain("+500");
    expect(s).not.toContain("CHIPS");
    expect(s).not.toContain("Żetony");
  });

  // Tekst z `driftSummary` ląduje w `Notification.message`, czyli PERSYSTUJE — więc niesie
  // MARKER, nie rozwiniętą nazwę. Bez tego portal z walutą „Duszki" dostawał powiadomienie
  // mówiące „GT" (waluta cudzego portalu). Rozwija dopiero `GET /api/notifications`.
  it("waluta portalu wychodzi jako marker %gt%, nigdy jako literał GT", () => {
    const s = driftSummary([{ currency: "GT", balance: 1500, ledger: 1000, drift: 500 }]);
    expect(s).toContain("%gt%");
    expect(s).not.toMatch(/\bGT\b/);
  });

  // Żetony to celowo WSPÓLNA, darmowa waluta kasyna — nie brandowana per portal
  // (`terms` §3 opiera na tym 18+ i „to nie hazard na pieniądze"), więc zostają dosłownie.
  it("żetony zostają dosłowne — nie są walutą per portal", () => {
    const s = driftSummary([{ currency: "CHIPS", balance: 200, ledger: 50, drift: 150 }]);
    expect(s).toContain("Żetony");
    expect(s).not.toContain("%");
  });
  it("is empty when everything reconciles (caller skips the alert)", () => {
    expect(driftSummary([{ currency: "GT", balance: 0, ledger: 0, drift: 0 }])).toBe("");
  });
});
