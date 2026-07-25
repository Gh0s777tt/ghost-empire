// src/lib/__tests__/obs-revert.test.ts
import { describe, it, expect } from "vitest";
import { revertTargetKey, mergeRevert, revertDelayMs, type PendingRevert, type RestoreSpec } from "@/lib/obs-revert";
import type { ObsAction } from "@/lib/obs-rules";

const NOW = 1_700_000_000_000;

const sceneAction = (scene: string): ObsAction => ({ kind: "switch_scene", scene, revertAfterMs: 5_000 });
const filterAction = (source: string, filter: string): ObsAction => ({
  kind: "toggle_filter", source, filter, enabled: true, revertAfterMs: 5_000,
});
const sourceAction = (scene: string, source: string): ObsAction => ({
  kind: "toggle_source", scene, source, visible: true, revertAfterMs: 5_000,
});

const pending = (key: string, dueAt: number, restore: RestoreSpec): PendingRevert => ({ key, dueAt, restore });
const filterRestore = (enabled: boolean): RestoreSpec => ({ kind: "filter", sourceName: "Kamera", filterName: "Blur", enabled });

describe("revertTargetKey", () => {
  it("gives EVERY scene switch the same key — OBS has one program scene, so they always collide", () => {
    expect(revertTargetKey(sceneAction("Kara"))).toBe(revertTargetKey(sceneAction("Inna kara")));
  });

  it("keys filters and sources by the exact thing they flip, so unrelated effects run independently", () => {
    expect(revertTargetKey(filterAction("Kamera", "Blur"))).not.toBe(revertTargetKey(filterAction("Kamera", "Shake")));
    expect(revertTargetKey(filterAction("Kamera", "Blur"))).not.toBe(revertTargetKey(filterAction("Gameplay", "Blur")));
    expect(revertTargetKey(sourceAction("Main", "Logo"))).not.toBe(revertTargetKey(sourceAction("Main", "Alert")));
    expect(revertTargetKey(filterAction("Kamera", "Blur"))).toBe(revertTargetKey(filterAction("Kamera", "Blur")));
  });

  it("never confuses a source toggle with a filter toggle of the same names", () => {
    expect(revertTargetKey(sourceAction("A", "B"))).not.toBe(revertTargetKey(filterAction("A", "B")));
  });
});

describe("mergeRevert — the first effect owns the baseline, the last owns the deadline", () => {
  it("captures the baseline when nothing is pending", () => {
    const plan = mergeRevert(undefined, pending("filter:Kamera Blur", NOW + 5_000, filterRestore(false)));
    expect(plan.captureBaseline).toBe(true);
    expect(plan.cancelPrevious).toBe(false);
    expect(plan.pending.dueAt).toBe(NOW + 5_000);
  });

  it("does NOT re-capture the baseline while a revert is pending — this is the stream-wedging bug", () => {
    // Before the fix, a second scene switch recorded the FIRST EFFECT'S scene as "previous", so its
    // revert put the stream on an effect scene and left it there forever.
    const first = pending("scene", NOW + 30_000, { kind: "scene", sceneName: "Główna" });
    const plan = mergeRevert(first, pending("scene", NOW + 5_000, { kind: "scene", sceneName: "Kara-Blur" }));
    expect(plan.captureBaseline).toBe(false);
    expect(plan.pending.restore).toEqual({ kind: "scene", sceneName: "Główna" }); // the TRUE baseline
  });

  it("takes the LATER deadline, so a short effect cannot end a long one early", () => {
    const long = pending("filter:Kamera Blur", NOW + 30_000, filterRestore(false));
    const merged = mergeRevert(long, pending("filter:Kamera Blur", NOW + 5_000, filterRestore(true)));
    expect(merged.pending.dueAt).toBe(NOW + 30_000);
    expect(merged.cancelPrevious).toBe(true); // the old timer must go, or it fires at 30s as well
  });

  it("extends the deadline when the new effect lasts longer", () => {
    const short = pending("filter:Kamera Blur", NOW + 5_000, filterRestore(false));
    expect(mergeRevert(short, pending("filter:Kamera Blur", NOW + 45_000, filterRestore(true))).pending.dueAt)
      .toBe(NOW + 45_000);
  });

  it("leaves a DIFFERENT target's pending revert alone", () => {
    const blur = pending("filter:Kamera Blur", NOW + 30_000, filterRestore(false));
    const plan = mergeRevert(blur, pending("filter:Kamera Shake", NOW + 5_000, filterRestore(false)));
    expect(plan.captureBaseline).toBe(true);      // a fresh target owns its own baseline
    expect(plan.cancelPrevious).toBe(false);      // and must not cancel the blur's timer
    expect(plan.pending.key).toBe("filter:Kamera Shake");
  });

  it("collapses a burst on one target into exactly ONE revert at the furthest deadline", () => {
    // The penalties module's normal mode: many overlapping random effects.
    const key = "filter:Kamera Blur";
    const base = filterRestore(false);
    let cur = mergeRevert(undefined, pending(key, NOW + 3_000, base)).pending;
    for (const ms of [10_000, 2_000, 25_000, 7_000]) {
      cur = mergeRevert(cur, pending(key, NOW + ms, filterRestore(true))).pending;
    }
    expect(cur.dueAt).toBe(NOW + 25_000);
    expect(cur.restore).toEqual(base); // still the state from before the very first effect
  });
});

describe("revertDelayMs", () => {
  it("is the remaining time", () => {
    expect(revertDelayMs(pending("k", NOW + 5_000, filterRestore(false)), NOW)).toBe(5_000);
  });

  it("fires immediately rather than skipping when the deadline already passed", () => {
    // A stalled tab or a clock jump must not swallow the revert: a skipped one leaves the scene
    // modified with nothing left to fix it.
    expect(revertDelayMs(pending("k", NOW - 60_000, filterRestore(false)), NOW)).toBe(0);
  });
});
