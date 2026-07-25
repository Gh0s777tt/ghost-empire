// src/lib/__tests__/penalties.test.ts
import { describe, it, expect } from "vitest";
import {
  eligiblePenalties,
  drawPenalty,
  canFireNow,
  queueSlot,
  INTENSITY_MAX,
  DURATION_MAX_MS,
  DURATION_MIN_MS,
  MAX_QUEUE_DEPTH,
  type PenaltySpec,
} from "@/lib/penalties";
import { penaltyAction } from "@/lib/penalties-run";

const spec = (over: Partial<PenaltySpec> = {}): PenaltySpec => ({
  id: "blur",
  weight: 10,
  minPln: 0,
  minIntensity: 2,
  maxIntensity: 4,
  minDurationMs: 3_000,
  maxDurationMs: 9_000,
  ...over,
});

/** A deterministic rng that hands out the given values in order — the draw contract is positional. */
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

describe("eligiblePenalties — tiers filter, never boost", () => {
  const pool = [
    spec({ id: "mild", minPln: 0 }),
    spec({ id: "medium", minPln: 20 }),
    spec({ id: "nasty", minPln: 100 }),
  ];

  it("unlocks harsher penalties as the donation grows", () => {
    expect(eligiblePenalties(pool, 5).map((p) => p.id)).toEqual(["mild"]);
    expect(eligiblePenalties(pool, 20).map((p) => p.id)).toEqual(["mild", "medium"]);
    expect(eligiblePenalties(pool, 100).map((p) => p.id)).toEqual(["mild", "medium", "nasty"]);
  });

  it("keeps published odds honest — a big donation does not re-weight the mild entries", () => {
    // Tiering only ADDS entries; the weights of the ones already in the pool are untouched, so the
    // odds a viewer was shown for a given tier are the odds they get.
    const small = eligiblePenalties(pool, 5);
    const big = eligiblePenalties(pool, 100);
    expect(small[0].weight).toBe(big[0].weight);
  });

  it("drops zero/negative weights without needing the row deleted", () => {
    expect(eligiblePenalties([spec({ weight: 0 }), spec({ id: "x", weight: -3 })], 50)).toHaveLength(0);
  });

  it("refuses a non-positive amount rather than treating it as free", () => {
    for (const bad of [0, -10, NaN, Infinity]) {
      expect(eligiblePenalties(pool, bad)).toHaveLength(0);
    }
  });
});

describe("drawPenalty", () => {
  it("returns null on an empty pool instead of inventing a penalty", () => {
    // A viewer who paid and got a FABRICATED outcome is worse off than one who got nothing.
    expect(drawPenalty([], seq(0.5))).toBeNull();
  });

  it("consumes exactly three rng values, in the order penalty → intensity → duration", () => {
    // The order is part of the contract: a provably-fair replay of the same seed must reproduce the
    // same outcome, so it may not be reshuffled.
    let calls = 0;
    const rng = () => { calls++; return 0.5; };
    drawPenalty([spec()], rng);
    expect(calls).toBe(3);
  });

  it("respects the weights via the SHARED picker (same one the wheel uses)", () => {
    const pool = [spec({ id: "a", weight: 1 }), spec({ id: "b", weight: 99 })];
    expect(drawPenalty(pool, seq(0.0, 0.5, 0.5))!.penaltyId).toBe("a");   // first 1% of the range
    expect(drawPenalty(pool, seq(0.5, 0.5, 0.5))!.penaltyId).toBe("b");
    expect(drawPenalty(pool, seq(0.999, 0.5, 0.5))!.penaltyId).toBe("b");
  });

  it("draws intensity and duration inside the configured band, endpoints included", () => {
    const p = spec({ minIntensity: 2, maxIntensity: 4, minDurationMs: 3_000, maxDurationMs: 9_000 });
    expect(drawPenalty([p], seq(0.5, 0.0, 0.0))).toMatchObject({ intensity: 2, durationMs: 3_000 });
    // 0.9999999 is the clamp ceiling, and it must land on the band's TOP value. A plain 0.999 does
    // not: the 3000–9000 ms band has 6001 discrete values, so 0.999 lands on 8994 — which is correct
    // uniform behaviour, and worth pinning so nobody "fixes" the draw to reach the top too early.
    expect(drawPenalty([p], seq(0.5, 0.9999999, 0.9999999))).toMatchObject({ intensity: 4, durationMs: 9_000 });
    expect(drawPenalty([p], seq(0.5, 0.5, 0.999))!.durationMs).toBe(8_994);
    const mid = drawPenalty([p], seq(0.5, 0.5, 0.5))!;
    expect(mid.intensity).toBeGreaterThanOrEqual(2);
    expect(mid.intensity).toBeLessThanOrEqual(4);
  });

  it("clamps whatever the streamer typed into the panel", () => {
    // The panel validates too, but a stored row from an older/edited config must never produce a
    // 10-minute blur at intensity 40.
    const insane = spec({ minIntensity: -5, maxIntensity: 99, minDurationMs: 1, maxDurationMs: 9_999_999 });
    const hard = drawPenalty([insane], seq(0.5, 0.999, 0.999))!;
    expect(hard.intensity).toBeLessThanOrEqual(INTENSITY_MAX);
    expect(hard.durationMs).toBeLessThanOrEqual(DURATION_MAX_MS);
    const soft = drawPenalty([insane], seq(0.5, 0.0, 0.0))!;
    expect(soft.intensity).toBeGreaterThanOrEqual(1);
    expect(soft.durationMs).toBeGreaterThanOrEqual(DURATION_MIN_MS);
  });

  it("handles an inverted band without producing a negative duration", () => {
    const inverted = spec({ minIntensity: 5, maxIntensity: 2, minDurationMs: 9_000, maxDurationMs: 3_000 });
    const d = drawPenalty([inverted], seq(0.5, 0.7, 0.7))!;
    expect(d.intensity).toBe(5);
    expect(d.durationMs).toBe(9_000);
  });
});

describe("canFireNow — the cooldown the audit flagged as missing on shop/sound rewards", () => {
  const now = new Date("2026-07-25T20:00:00Z");
  it("allows the first ever penalty", () => {
    expect(canFireNow(null, 30_000, now)).toBe(true);
  });
  it("blocks inside the window and allows exactly at the boundary", () => {
    expect(canFireNow(new Date("2026-07-25T19:59:45Z"), 30_000, now)).toBe(false);
    expect(canFireNow(new Date("2026-07-25T19:59:30Z"), 30_000, now)).toBe(true);
  });
  it("treats a zero/negative cooldown as no cooldown, not as a block", () => {
    expect(canFireNow(new Date("2026-07-25T19:59:59Z"), 0, now)).toBe(true);
    expect(canFireNow(new Date("2026-07-25T19:59:59Z"), -5_000, now)).toBe(true);
  });
});

describe("queueSlot — penalties run strictly one at a time", () => {
  const now = new Date("2026-07-25T20:00:00Z");

  it("starts immediately when nothing is running", () => {
    expect(queueSlot(null, 5_000, now, 0)!.toISOString()).toBe(now.toISOString());
  });

  it("waits for the running penalty to end, plus the cooldown", () => {
    // Two effects toggling the same OBS filter concurrently race on the revert: the second timer
    // re-enables a filter the first just turned off and the scene stays broken. Serialising is a
    // correctness requirement here, not politeness.
    const busyUntil = new Date("2026-07-25T20:00:10Z");
    expect(queueSlot(busyUntil, 5_000, now, 1)!.toISOString()).toBe("2026-07-25T20:00:15.000Z");
  });

  it("never schedules in the past when the queue has already drained", () => {
    const stale = new Date("2026-07-25T19:00:00Z");
    expect(queueSlot(stale, 5_000, now, 0)!.toISOString()).toBe(now.toISOString());
  });

  it("refuses once the queue is full, so a raid cannot buy an hour of effects in ten seconds", () => {
    expect(queueSlot(new Date("2026-07-25T20:00:10Z"), 5_000, now, MAX_QUEUE_DEPTH)).toBeNull();
    expect(queueSlot(null, 5_000, now, MAX_QUEUE_DEPTH + 3)).toBeNull();
  });
});

describe("penaltyAction — the stored row → actuator action translation", () => {
  const row = {
    actionKind: "set_filter_intensity", scene: null, source: "Kamera", filter: "Blur",
    setting: "Filter.Blur.Size", rangeMin: 1, rangeMax: 40, targetState: null,
  };

  it("carries the DRAWN duration as the revert window and the drawn intensity", () => {
    const a = penaltyAction(row, 4, 7_500)!;
    expect(a).toMatchObject({ kind: "set_filter_intensity", intensity: 4, revertAfterMs: 7_500, min: 1, max: 40 });
  });

  it("builds each of the four action kinds", () => {
    expect(penaltyAction({ ...row, actionKind: "switch_scene", scene: "Kara" }, 3, 5_000))
      .toMatchObject({ kind: "switch_scene", scene: "Kara", revertAfterMs: 5_000 });
    expect(penaltyAction({ ...row, actionKind: "toggle_source", scene: "Main", targetState: false }, 3, 5_000))
      .toMatchObject({ kind: "toggle_source", visible: false });
    expect(penaltyAction({ ...row, actionKind: "toggle_filter", targetState: true }, 3, 5_000))
      .toMatchObject({ kind: "toggle_filter", enabled: true });
  });

  it("returns null for an INCOMPLETE row instead of sending OBS a half-built action", () => {
    // A row can lose a column through an admin edit or an older config. Refusing beats calling OBS
    // with `undefined` names, which would throw inside the actuator on every draw.
    expect(penaltyAction({ ...row, source: null }, 3, 5_000)).toBeNull();
    expect(penaltyAction({ ...row, setting: null }, 3, 5_000)).toBeNull();
    expect(penaltyAction({ ...row, rangeMin: null }, 3, 5_000)).toBeNull();
    expect(penaltyAction({ ...row, actionKind: "switch_scene", scene: null }, 3, 5_000)).toBeNull();
    expect(penaltyAction({ ...row, actionKind: "toggle_source", scene: null }, 3, 5_000)).toBeNull();
    expect(penaltyAction({ ...row, actionKind: "nonsense" }, 3, 5_000)).toBeNull();
  });

  it("defaults an unset targetState to 'apply the effect', not 'undo it'", () => {
    expect(penaltyAction({ ...row, actionKind: "toggle_filter", targetState: null }, 3, 5_000))
      .toMatchObject({ enabled: true });
    expect(penaltyAction({ ...row, actionKind: "toggle_source", scene: "Main", targetState: null }, 3, 5_000))
      .toMatchObject({ visible: true });
  });
});
