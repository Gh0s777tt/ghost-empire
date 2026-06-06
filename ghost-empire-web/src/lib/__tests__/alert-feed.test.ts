import { describe, it, expect } from "vitest";
import { shapeAlerts, type AlertRow } from "@/lib/alert-feed";
import { DEFAULT_ALERT_TYPE_CFG, type AlertTypeCfg } from "@/lib/alert-types";

const CREATED = new Date("2026-01-01T12:00:00.000Z");

function row(over: Partial<AlertRow> = {}): AlertRow {
  return {
    id: "a1",
    type: "donation",
    title: "Donejt!",
    message: "10 PLN",
    icon: null,
    actorName: "Widz",
    actorImage: null,
    amount: 10,
    amountLabel: "PLN",
    meta: null,
    createdAt: CREATED,
    shownAt: null,
    ...over,
  };
}

describe("shapeAlerts", () => {
  it("falls back to DEFAULT_ALERT_TYPE_CFG for unconfigured types", () => {
    const [out] = shapeAlerts([row()], {});
    expect(out.animation).toBe(DEFAULT_ALERT_TYPE_CFG.animation);
    expect(out.position).toBe(DEFAULT_ALERT_TYPE_CFG.position);
    expect(out.soundUrl).toBeNull();
    expect(out.accent).toBeNull();
    expect(out.createdAt).toBe(CREATED.toISOString());
  });

  it("applies the per-type config (animation / position / soundUrl)", () => {
    const cfg: Record<string, AlertTypeCfg> = {
      donation: { animation: "scale", position: "top-center", soundUrl: "https://x/s.mp3", minAmount: null },
    };
    const [out] = shapeAlerts([row()], cfg);
    expect(out.animation).toBe("scale");
    expect(out.position).toBe("top-center");
    expect(out.soundUrl).toBe("https://x/s.mp3");
  });

  it("drops alerts below the type's minAmount, keeps those at/above", () => {
    const cfg: Record<string, AlertTypeCfg> = {
      donation: { ...DEFAULT_ALERT_TYPE_CFG, minAmount: 50 },
    };
    expect(shapeAlerts([row({ amount: 49 })], cfg)).toHaveLength(0);
    expect(shapeAlerts([row({ amount: 50 })], cfg)).toHaveLength(1);
    expect(shapeAlerts([row({ amount: 51 })], cfg)).toHaveLength(1);
  });

  it("treats a null amount as 0 against a minAmount threshold", () => {
    const cfg: Record<string, AlertTypeCfg> = {
      donation: { ...DEFAULT_ALERT_TYPE_CFG, minAmount: 1 },
    };
    expect(shapeAlerts([row({ amount: null })], cfg)).toHaveLength(0);
  });

  it("lifts a per-alert accent override out of meta JSON", () => {
    const [out] = shapeAlerts([row({ meta: JSON.stringify({ accent: "#00ff00" }) })], {});
    expect(out.accent).toBe("#00ff00");
  });

  it("ignores malformed meta JSON (accent stays null)", () => {
    const [out] = shapeAlerts([row({ meta: "{not json" })], {});
    expect(out.accent).toBeNull();
  });

  it("preserves order and maps multiple rows", () => {
    const out = shapeAlerts([row({ id: "a" }), row({ id: "b" }), row({ id: "c" })], {});
    expect(out.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });
});
