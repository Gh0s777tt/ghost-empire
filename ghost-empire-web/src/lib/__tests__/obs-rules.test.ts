import { describe, it, expect } from "vitest";
import {
  obsActionsForAlert,
  validateObsAction,
  validateObsRule,
  ANY_TRIGGER,
  REVERT_MIN_MS,
  REVERT_MAX_MS,
  type ObsRule,
} from "../obs-rules";

const sceneRule = (over: Partial<ObsRule> = {}): ObsRule => ({
  enabled: true,
  triggerType: "donation",
  action: { kind: "switch_scene", scene: "BIG DONO" },
  ...over,
});

describe("obsActionsForAlert", () => {
  it("matches an alert by exact trigger type", () => {
    const actions = obsActionsForAlert({ type: "donation" }, [sceneRule()]);
    expect(actions).toEqual([{ kind: "switch_scene", scene: "BIG DONO" }]);
  });

  it("does not match a different type", () => {
    expect(obsActionsForAlert({ type: "twitch_sub" }, [sceneRule()])).toEqual([]);
  });

  it('wildcard "*" matches any type', () => {
    const rule = sceneRule({ triggerType: ANY_TRIGGER });
    expect(obsActionsForAlert({ type: "welcome" }, [rule])).toHaveLength(1);
    expect(obsActionsForAlert({ type: "level_up" }, [rule])).toHaveLength(1);
  });

  it("excludes disabled rules", () => {
    expect(obsActionsForAlert({ type: "donation" }, [sceneRule({ enabled: false })])).toEqual([]);
  });

  it("honours minAmount threshold (below excluded, equal/above included)", () => {
    const rule = sceneRule({ minAmount: 50 });
    expect(obsActionsForAlert({ type: "donation", amount: 49 }, [rule])).toEqual([]);
    expect(obsActionsForAlert({ type: "donation", amount: 50 }, [rule])).toHaveLength(1);
    expect(obsActionsForAlert({ type: "donation", amount: 100 }, [rule])).toHaveLength(1);
  });

  it("treats a missing/null amount as 0 against a threshold", () => {
    const rule = sceneRule({ minAmount: 1 });
    expect(obsActionsForAlert({ type: "donation" }, [rule])).toEqual([]);
    expect(obsActionsForAlert({ type: "donation", amount: null }, [rule])).toEqual([]);
  });

  it("a rule with no minAmount fires regardless of amount", () => {
    expect(obsActionsForAlert({ type: "donation" }, [sceneRule()])).toHaveLength(1);
  });

  it("returns matching actions ordered by sortOrder", () => {
    const a = sceneRule({ action: { kind: "switch_scene", scene: "A" }, sortOrder: 2 });
    const b = sceneRule({ action: { kind: "switch_scene", scene: "B" }, sortOrder: 1 });
    const c = sceneRule({ action: { kind: "switch_scene", scene: "C" }, sortOrder: 3 });
    const scenes = obsActionsForAlert({ type: "donation" }, [a, b, c]).map((x) =>
      x.kind === "switch_scene" ? x.scene : null,
    );
    expect(scenes).toEqual(["B", "A", "C"]);
  });

  it("does not mutate the input rules array", () => {
    const rules = [sceneRule({ sortOrder: 2 }), sceneRule({ sortOrder: 1 })];
    const snapshot = rules.map((r) => r.sortOrder);
    obsActionsForAlert({ type: "donation" }, rules);
    expect(rules.map((r) => r.sortOrder)).toEqual(snapshot);
  });

  it("returns [] for an empty rule set", () => {
    expect(obsActionsForAlert({ type: "donation" }, [])).toEqual([]);
  });
});

describe("validateObsAction", () => {
  it("accepts a valid switch_scene", () => {
    expect(validateObsAction({ kind: "switch_scene", scene: "BRB" })).toEqual({
      ok: true,
      value: { kind: "switch_scene", scene: "BRB", revertAfterMs: null },
    });
  });

  it("accepts a valid toggle_source", () => {
    const r = validateObsAction({ kind: "toggle_source", scene: "Main", source: "Cam", visible: true });
    expect(r).toEqual({
      ok: true,
      value: { kind: "toggle_source", scene: "Main", source: "Cam", visible: true, revertAfterMs: null },
    });
  });

  it("accepts a valid toggle_filter with a revert window", () => {
    const r = validateObsAction({ kind: "toggle_filter", source: "Cam", filter: "Blur", enabled: true, revertAfterMs: 5000 });
    expect(r).toEqual({
      ok: true,
      value: { kind: "toggle_filter", source: "Cam", filter: "Blur", enabled: true, revertAfterMs: 5000 },
    });
  });

  it("trims whitespace in names", () => {
    const r = validateObsAction({ kind: "switch_scene", scene: "  BRB  " });
    expect(r.ok && r.value.kind === "switch_scene" && r.value.scene).toBe("BRB");
  });

  it("rejects an unknown kind", () => {
    expect(validateObsAction({ kind: "explode" }).ok).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(validateObsAction(null).ok).toBe(false);
    expect(validateObsAction("switch_scene").ok).toBe(false);
  });

  it("rejects switch_scene with an empty scene", () => {
    expect(validateObsAction({ kind: "switch_scene", scene: "  " }).ok).toBe(false);
    expect(validateObsAction({ kind: "switch_scene" }).ok).toBe(false);
  });

  it("rejects toggle_source missing fields or non-boolean visible", () => {
    expect(validateObsAction({ kind: "toggle_source", scene: "M", source: "C" }).ok).toBe(false); // no visible
    expect(validateObsAction({ kind: "toggle_source", scene: "M", visible: true }).ok).toBe(false); // no source
    expect(validateObsAction({ kind: "toggle_source", source: "C", visible: true }).ok).toBe(false); // no scene
  });

  it("rejects toggle_filter missing fields", () => {
    expect(validateObsAction({ kind: "toggle_filter", source: "Cam", enabled: true }).ok).toBe(false);
    expect(validateObsAction({ kind: "toggle_filter", filter: "Blur", enabled: true }).ok).toBe(false);
  });

  it("rejects an out-of-bounds or non-integer revertAfterMs", () => {
    expect(validateObsAction({ kind: "switch_scene", scene: "X", revertAfterMs: REVERT_MIN_MS - 1 }).ok).toBe(false);
    expect(validateObsAction({ kind: "switch_scene", scene: "X", revertAfterMs: REVERT_MAX_MS + 1 }).ok).toBe(false);
    expect(validateObsAction({ kind: "switch_scene", scene: "X", revertAfterMs: 1.5 }).ok).toBe(false);
  });

  it("accepts null revertAfterMs", () => {
    expect(validateObsAction({ kind: "switch_scene", scene: "X", revertAfterMs: null }).ok).toBe(true);
  });
});

describe("validateObsRule", () => {
  it("accepts a valid rule and defaults enabled to true", () => {
    const r = validateObsRule({ triggerType: "donation", action: { kind: "switch_scene", scene: "Dono" } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.enabled).toBe(true);
      expect(r.value.minAmount).toBeNull();
      expect(r.value.sortOrder).toBe(0);
      expect(r.value.action).toEqual({ kind: "switch_scene", scene: "Dono", revertAfterMs: null });
    }
  });

  it("respects an explicit enabled=false", () => {
    const r = validateObsRule({ enabled: false, triggerType: "donation", action: { kind: "switch_scene", scene: "X" } });
    expect(r.ok && r.value.enabled).toBe(false);
  });

  it("rejects an empty triggerType", () => {
    expect(validateObsRule({ triggerType: "  ", action: { kind: "switch_scene", scene: "X" } }).ok).toBe(false);
    expect(validateObsRule({ action: { kind: "switch_scene", scene: "X" } }).ok).toBe(false);
  });

  it("rejects a negative or non-integer minAmount", () => {
    expect(validateObsRule({ triggerType: "donation", minAmount: -1, action: { kind: "switch_scene", scene: "X" } }).ok).toBe(false);
    expect(validateObsRule({ triggerType: "donation", minAmount: 2.5, action: { kind: "switch_scene", scene: "X" } }).ok).toBe(false);
  });

  it("accepts a null minAmount", () => {
    expect(validateObsRule({ triggerType: "donation", minAmount: null, action: { kind: "switch_scene", scene: "X" } }).ok).toBe(true);
  });

  it("rejects a non-integer sortOrder", () => {
    expect(validateObsRule({ triggerType: "donation", sortOrder: 1.2, action: { kind: "switch_scene", scene: "X" } }).ok).toBe(false);
  });

  it("propagates a nested action validation error", () => {
    const r = validateObsRule({ triggerType: "donation", action: { kind: "switch_scene", scene: "" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/scene/);
  });

  it("end-to-end: a validated rule actuates through obsActionsForAlert", () => {
    const r = validateObsRule({ triggerType: "donation", minAmount: 100, action: { kind: "switch_scene", scene: "HYPE" } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(obsActionsForAlert({ type: "donation", amount: 150 }, [r.value])).toEqual([
        { kind: "switch_scene", scene: "HYPE", revertAfterMs: null },
      ]);
      expect(obsActionsForAlert({ type: "donation", amount: 50 }, [r.value])).toEqual([]);
    }
  });
});
