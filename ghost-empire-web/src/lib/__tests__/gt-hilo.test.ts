import { describe, it, expect } from "vitest";
import { hiloChance, hiloStepMultiplier, drawCard, HILO_EDGE } from "@/lib/gt-hilo";

describe("hilo odds", () => {
  it("chances are symmetric and exclude ties", () => {
    expect(hiloChance(1, "hi")).toBeCloseTo(12 / 13);  // from an Ace almost everything is higher
    expect(hiloChance(1, "lo")).toBe(0);               // nothing below an Ace
    expect(hiloChance(13, "hi")).toBe(0);              // nothing above a King
    expect(hiloChance(7, "hi")).toBeCloseTo(6 / 13);
    expect(hiloChance(7, "lo")).toBeCloseTo(6 / 13);
  });

  it("step multiplier = (1-edge)/P and impossible guesses pay 0", () => {
    expect(hiloStepMultiplier(7, "hi")).toBeCloseTo((1 - HILO_EDGE) / (6 / 13));
    expect(hiloStepMultiplier(13, "hi")).toBe(0);
    expect(hiloStepMultiplier(1, "lo")).toBe(0);
  });

  it("each step has flat RTP = 1-edge (EV check)", () => {
    for (const rank of [2, 5, 7, 10, 12]) {
      for (const guess of ["hi", "lo"] as const) {
        const ev = hiloChance(rank, guess) * hiloStepMultiplier(rank, guess);
        expect(ev).toBeCloseTo(1 - HILO_EDGE, 10);
      }
    }
  });

  it("draws valid cards", () => {
    for (let i = 0; i < 200; i++) {
      const c = drawCard();
      expect(c.rank).toBeGreaterThanOrEqual(1);
      expect(c.rank).toBeLessThanOrEqual(13);
      expect(c.suit).toBeGreaterThanOrEqual(0);
      expect(c.suit).toBeLessThanOrEqual(3);
    }
  });
});
