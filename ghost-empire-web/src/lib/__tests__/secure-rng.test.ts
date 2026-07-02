import { describe, it, expect } from "vitest";
import { cryptoRng } from "@/lib/secure-rng";

// The CSPRNG source that backs every money-path draw (casino / duels / heists, #777).
describe("cryptoRng", () => {
  it("returns a finite number in [0, 1) across many samples", () => {
    for (let i = 0; i < 5000; i++) {
      const r = cryptoRng();
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
});
