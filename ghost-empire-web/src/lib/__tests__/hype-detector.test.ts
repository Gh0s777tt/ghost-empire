import { describe, it, expect, beforeEach } from "vitest";
import { detectHypeSpike, recordAndCheckHype, _resetHypeState } from "@/lib/hype-detector";

describe("detectHypeSpike", () => {
  it("fires when enough messages fall inside the window", () => {
    const now = 10_000;
    const ts = [9600, 9700, 9800, 9900, 10_000]; // 5 in the last 8s
    expect(detectHypeSpike(ts, now, 8000, 5)).toBe(true);
    expect(detectHypeSpike(ts, now, 8000, 6)).toBe(false);
  });
  it("ignores messages older than the window", () => {
    const now = 10_000;
    const ts = [100, 200, 300, 9900, 10_000]; // only 2 within 8s
    expect(detectHypeSpike(ts, now, 8000, 3)).toBe(false);
  });
});

describe("recordAndCheckHype", () => {
  beforeEach(() => _resetHypeState());
  const opts = { windowMs: 8000, threshold: 3, cooldownMs: 10_000 };

  it("triggers once the threshold is crossed", () => {
    expect(recordAndCheckHype("t", 1000, opts)).toBe(false);
    expect(recordAndCheckHype("t", 1100, opts)).toBe(false);
    expect(recordAndCheckHype("t", 1200, opts)).toBe(true); // 3rd within window
  });

  it("respects the cooldown after a trigger", () => {
    recordAndCheckHype("t", 1000, opts);
    recordAndCheckHype("t", 1100, opts);
    expect(recordAndCheckHype("t", 1200, opts)).toBe(true);
    // more messages immediately after — still cooling down
    expect(recordAndCheckHype("t", 1300, opts)).toBe(false);
    // after cooldown, a fresh burst can trigger again
    expect(recordAndCheckHype("t", 12_000, opts)).toBe(false);
    expect(recordAndCheckHype("t", 12_100, opts)).toBe(false);
    expect(recordAndCheckHype("t", 12_200, opts)).toBe(true);
  });

  it("keeps tenants independent", () => {
    recordAndCheckHype("a", 1000, opts);
    recordAndCheckHype("a", 1100, opts);
    expect(recordAndCheckHype("b", 1200, opts)).toBe(false); // b has only 1
  });
});
