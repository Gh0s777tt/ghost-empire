import { describe, it, expect } from "vitest";
import {
  goveeActionsForAlert,
  validateGoveeAction,
  validateGoveeRule,
  normalizeHex,
  GOVEE_ACTION_KINDS,
  ANY_TRIGGER,
  REVERT_MIN_MS,
  REVERT_MAX_MS,
  BRIGHTNESS_MAX,
  type GoveeRule,
} from "@/lib/govee-rules";

const rule = (over: Partial<GoveeRule> = {}): GoveeRule => ({
  enabled: true,
  triggerType: "donation",
  minAmount: null,
  action: { kind: "set_color", color: "#e50914", revertColor: null, revertAfterMs: null },
  sortOrder: 0,
  ...over,
});

describe("normalizeHex", () => {
  it("accepts 6-digit hex with or without # and lowercases", () => {
    expect(normalizeHex("#E50914")).toBe("#e50914");
    expect(normalizeHex("E50914")).toBe("#e50914");
    expect(normalizeHex("  #AbCdEf ")).toBe("#abcdef");
  });
  it("rejects bad input", () => {
    expect(normalizeHex("#fff")).toBeNull(); // 3-digit not allowed
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#1234567")).toBeNull();
    expect(normalizeHex(123 as unknown)).toBeNull();
    expect(normalizeHex(null as unknown)).toBeNull();
  });
});

describe("goveeActionsForAlert", () => {
  it("returns actions for matching enabled rules", () => {
    const out = goveeActionsForAlert({ type: "donation", amount: 10 }, [rule()]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "set_color", color: "#e50914" });
  });

  it("skips disabled rules", () => {
    expect(goveeActionsForAlert({ type: "donation", amount: 10 }, [rule({ enabled: false })])).toEqual([]);
  });

  it("matches by exact trigger type and ignores others", () => {
    const rules = [rule({ triggerType: "donation" }), rule({ triggerType: "twitch_sub" })];
    expect(goveeActionsForAlert({ type: "donation", amount: 0 }, rules)).toHaveLength(1);
  });

  it('"*" trigger matches any alert type', () => {
    const out = goveeActionsForAlert({ type: "level_up", amount: 0 }, [rule({ triggerType: ANY_TRIGGER })]);
    expect(out).toHaveLength(1);
  });

  it("honours the minAmount threshold", () => {
    const r = rule({ minAmount: 50 });
    expect(goveeActionsForAlert({ type: "donation", amount: 49 }, [r])).toEqual([]);
    expect(goveeActionsForAlert({ type: "donation", amount: 50 }, [r])).toHaveLength(1);
  });

  it("treats a null amount as 0 for the threshold", () => {
    expect(goveeActionsForAlert({ type: "donation", amount: null }, [rule({ minAmount: 1 })])).toEqual([]);
  });

  it("sorts matched rules by sortOrder ascending", () => {
    const a = rule({ sortOrder: 2, action: { kind: "turn", on: true } });
    const b = rule({ sortOrder: 1, action: { kind: "turn", on: false } });
    const out = goveeActionsForAlert({ type: "donation", amount: 0 }, [a, b]);
    expect(out.map((x) => (x.kind === "turn" ? x.on : null))).toEqual([false, true]);
  });

  it("never mutates the input rules array", () => {
    const rules = [rule({ sortOrder: 2 }), rule({ sortOrder: 1 })];
    const snapshot = rules.map((r) => r.sortOrder);
    goveeActionsForAlert({ type: "donation", amount: 0 }, rules);
    expect(rules.map((r) => r.sortOrder)).toEqual(snapshot);
  });
});

describe("validateGoveeAction", () => {
  it("accepts set_color and normalizes the hex", () => {
    const r = validateGoveeAction({ kind: "set_color", color: "E50914" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ kind: "set_color", color: "#e50914", revertColor: null, revertAfterMs: null });
  });

  it("accepts set_color with a revertColor + revertAfterMs (flash → rest)", () => {
    const r = validateGoveeAction({ kind: "set_color", color: "#ff0000", revertColor: "#ffffff", revertAfterMs: 4000 });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.kind === "set_color") {
      expect(r.value.revertColor).toBe("#ffffff");
      expect(r.value.revertAfterMs).toBe(4000);
    }
  });

  it("rejects set_color with a bad color or bad revertColor", () => {
    expect(validateGoveeAction({ kind: "set_color", color: "nope" }).ok).toBe(false);
    expect(validateGoveeAction({ kind: "set_color", color: "#fff000", revertColor: "bad" }).ok).toBe(false);
  });

  it("accepts set_brightness within range and rejects out-of-range / non-integer", () => {
    expect(validateGoveeAction({ kind: "set_brightness", brightness: 0 }).ok).toBe(true);
    expect(validateGoveeAction({ kind: "set_brightness", brightness: BRIGHTNESS_MAX }).ok).toBe(true);
    expect(validateGoveeAction({ kind: "set_brightness", brightness: 101 }).ok).toBe(false);
    expect(validateGoveeAction({ kind: "set_brightness", brightness: -1 }).ok).toBe(false);
    expect(validateGoveeAction({ kind: "set_brightness", brightness: 50.5 }).ok).toBe(false);
  });

  it("accepts turn on/off and rejects a non-boolean", () => {
    expect(validateGoveeAction({ kind: "turn", on: true }).ok).toBe(true);
    expect(validateGoveeAction({ kind: "turn", on: "yes" }).ok).toBe(false);
  });

  it("rejects unknown kinds and non-objects", () => {
    expect(validateGoveeAction({ kind: "explode" }).ok).toBe(false);
    expect(validateGoveeAction(null).ok).toBe(false);
    expect(validateGoveeAction("x").ok).toBe(false);
  });

  it("enforces the revertAfterMs bounds", () => {
    expect(validateGoveeAction({ kind: "turn", on: true, revertAfterMs: REVERT_MIN_MS - 1 }).ok).toBe(false);
    expect(validateGoveeAction({ kind: "turn", on: true, revertAfterMs: REVERT_MAX_MS + 1 }).ok).toBe(false);
    expect(validateGoveeAction({ kind: "turn", on: true, revertAfterMs: 1000 }).ok).toBe(true);
  });

  it("covers every declared action kind", () => {
    for (const kind of GOVEE_ACTION_KINDS) {
      const base: Record<string, unknown> =
        kind === "set_color" ? { color: "#000000" } : kind === "set_brightness" ? { brightness: 10 } : { on: true };
      expect(validateGoveeAction({ kind, ...base }).ok).toBe(true);
    }
  });
});

describe("validateGoveeRule", () => {
  it("accepts a valid rule and defaults enabled to true + sortOrder to 0", () => {
    const r = validateGoveeRule({ triggerType: "donation", action: { kind: "turn", on: true } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ enabled: true, triggerType: "donation", minAmount: null, sortOrder: 0 });
  });

  it('accepts "*" as triggerType but rejects an unknown alert type', () => {
    expect(validateGoveeRule({ triggerType: ANY_TRIGGER, action: { kind: "turn", on: false } }).ok).toBe(true);
    expect(validateGoveeRule({ triggerType: "made_up", action: { kind: "turn", on: false } }).ok).toBe(false);
  });

  it("requires a triggerType and a valid nested action", () => {
    expect(validateGoveeRule({ action: { kind: "turn", on: true } }).ok).toBe(false);
    expect(validateGoveeRule({ triggerType: "donation", action: { kind: "bogus" } }).ok).toBe(false);
  });

  it("validates minAmount and sortOrder types", () => {
    expect(validateGoveeRule({ triggerType: "donation", minAmount: -1, action: { kind: "turn", on: true } }).ok).toBe(false);
    expect(validateGoveeRule({ triggerType: "donation", sortOrder: 1.5, action: { kind: "turn", on: true } }).ok).toBe(false);
    expect(validateGoveeRule({ triggerType: "donation", minAmount: 100, sortOrder: 3, action: { kind: "turn", on: true } }).ok).toBe(true);
  });

  it("respects enabled:false", () => {
    const r = validateGoveeRule({ triggerType: "donation", enabled: false, action: { kind: "turn", on: true } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.enabled).toBe(false);
  });
});
