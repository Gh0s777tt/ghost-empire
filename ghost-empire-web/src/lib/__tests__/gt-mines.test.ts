import { describe, it, expect } from "vitest";
import { minesMultiplier, MINES_MAX_MULT, MINES_TILES } from "@/lib/gt-mines";

describe("minesMultiplier", () => {
  it("is 1 at zero (or fewer) reveals — break-even", () => {
    expect(minesMultiplier(0, 3)).toBe(1);
    expect(minesMultiplier(-1, 3)).toBe(1);
  });

  it("strictly increases with each additional safe reveal", () => {
    let prev = 0;
    for (let r = 1; r <= 10; r++) {
      const m = minesMultiplier(r, 3);
      expect(m).toBeGreaterThan(prev);
      prev = m;
    }
  });

  it("is higher with more bombs at the same reveal count", () => {
    expect(minesMultiplier(3, 5)).toBeGreaterThan(minesMultiplier(3, 1));
  });

  it("holds ~0.95 RTP on the first reveal regardless of bomb count", () => {
    // EV(first reveal) = P(safe) * payout-multiplier = (tiles-bombs)/tiles * mult
    for (const bombs of [1, 3, 5, 10]) {
      const ev = ((MINES_TILES - bombs) / MINES_TILES) * minesMultiplier(1, bombs);
      expect(ev).toBeCloseTo(0.95, 5);
    }
  });

  it("caps the multiplier at MINES_MAX_MULT for a runaway run", () => {
    // 14 safe reveals with 10 bombs blows far past the cap.
    expect(minesMultiplier(14, 10)).toBe(MINES_MAX_MULT);
  });
});
