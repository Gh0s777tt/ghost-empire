// src/lib/__tests__/hue-rules.test.ts
import { describe, it, expect } from "vitest";
import {
  hueActionsForAlert, validateHueAction, validateHueRule, briFromPercent, hexToXy,
  BRI_MIN, BRI_MAX, ANY_TRIGGER, type HueRule,
} from "@/lib/hue-rules";

const rule = (over: Partial<HueRule> = {}): HueRule => ({
  enabled: true, triggerType: "donation", minAmount: null, lightId: null,
  action: { kind: "turn", on: true }, sortOrder: 0, ...over,
});

describe("briFromPercent — Hue is 1..254, Govee is a percentage", () => {
  it("maps the ends without ever emitting 0", () => {
    // `bri: 0` is out of range for the Bridge and is NOT "off" — off is a separate action. Copying
    // Govee's 0..100 straight through is the most likely silent bug in this integration.
    expect(briFromPercent(0)).toBe(BRI_MIN);
    expect(briFromPercent(100)).toBe(BRI_MAX);
  });
  it("is monotonic in between and clamps nonsense", () => {
    expect(briFromPercent(50)).toBeGreaterThan(briFromPercent(25));
    expect(briFromPercent(999)).toBe(BRI_MAX);
    expect(briFromPercent(-10)).toBe(BRI_MIN);
    expect(briFromPercent(NaN)).toBe(BRI_MIN);
  });
});

describe("hexToXy — a wrong conversion lights the wrong colour silently", () => {
  it("puts primaries in the right corner of the CIE space", () => {
    const [rx, ry] = hexToXy("#ff0000")!;
    const [gx, gy] = hexToXy("#00ff00")!;
    const [bx, by] = hexToXy("#0000ff")!;
    expect(rx).toBeGreaterThan(gx);              // red is the most "x" of the three
    expect(gy).toBeGreaterThan(ry);              // green is the most "y"
    expect(by).toBeLessThan(gy);                 // blue sits low
    expect(bx).toBeLessThan(rx);
  });
  it("keeps white near the D65 white point", () => {
    const [x, y] = hexToXy("#ffffff")!;
    expect(x).toBeGreaterThan(0.28); expect(x).toBeLessThan(0.36);
    expect(y).toBeGreaterThan(0.28); expect(y).toBeLessThan(0.36);
  });
  it("refuses pure black — a light cannot be black, only off", () => {
    expect(hexToXy("#000000")).toBeNull();
    expect(validateHueAction({ kind: "set_color", hex: "#000000" }).ok).toBe(false);
  });
  it("accepts hex with or without the hash", () => {
    expect(hexToXy("ff8800")).not.toBeNull();
  });
});

describe("hueActionsForAlert", () => {
  it("matches by type, honours the wildcard and the amount threshold", () => {
    const rules = [
      rule({ triggerType: "donation", action: { kind: "turn", on: true } }),
      rule({ triggerType: ANY_TRIGGER, action: { kind: "set_brightness", percent: 50 } }),
      rule({ triggerType: "donation", minAmount: 100, action: { kind: "set_color", hex: "#ff0000" } }),
    ];
    expect(hueActionsForAlert({ type: "donation", amount: 10 }, rules)).toHaveLength(2);
    expect(hueActionsForAlert({ type: "donation", amount: 100 }, rules)).toHaveLength(3);
    expect(hueActionsForAlert({ type: "level_up", amount: null }, rules)).toHaveLength(1); // wildcard only
  });
  it("skips disabled rules and orders by sortOrder", () => {
    const rules = [
      rule({ sortOrder: 2, action: { kind: "turn", on: false } }),
      rule({ sortOrder: 1, action: { kind: "turn", on: true } }),
      rule({ enabled: false, action: { kind: "set_brightness", percent: 1 } }),
    ];
    const out = hueActionsForAlert({ type: "donation", amount: 1 }, rules);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ on: true });
  });
});

describe("validation refuses what the Bridge would reject", () => {
  it("bounds brightness and the revert window", () => {
    expect(validateHueAction({ kind: "set_brightness", percent: 101 }).ok).toBe(false);
    expect(validateHueAction({ kind: "set_brightness", percent: -1 }).ok).toBe(false);
    expect(validateHueAction({ kind: "turn", on: true, revertAfterMs: 5 }).ok).toBe(false); // below REVERT_MIN
    expect(validateHueAction({ kind: "turn", on: true, revertAfterMs: 5_000 }).ok).toBe(true);
  });
  it("normalises the colour and accepts an empty revert colour", () => {
    const r = validateHueAction({ kind: "set_color", hex: "FF8800", revertHex: "" });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.kind === "set_color") {
      expect(r.value.hex).toBe("#ff8800");
      expect(r.value.revertHex).toBeNull();
    }
  });
  it("rejects an unknown trigger so a typo cannot create a rule that never fires", () => {
    expect(validateHueRule({ ...rule(), triggerType: "nonsense" }).ok).toBe(false);
    expect(validateHueRule({ ...rule(), triggerType: ANY_TRIGGER }).ok).toBe(true);
  });
  it("keeps lightId optional — empty means every light on the bridge", () => {
    const r = validateHueRule({ ...rule(), lightId: "  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.lightId).toBeNull();
  });
});
