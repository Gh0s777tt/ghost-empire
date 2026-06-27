// src/lib/govee-rules.ts
// Per-tenant Govee lighting — pure logic that maps an incoming StreamAlert event to Govee
// light actions (set color / set brightness / turn on-off) per streamer-defined rules.
// This is the TESTABLE CORE — no DB, no network, no fetch. Mirrors lib/obs-rules.ts.
//
// The actuator (server-side dispatch in lib/govee.ts, a later slice) consumes the
// GoveeAction[] that goveeActionsForAlert() produces and translates each into a Govee
// cloud-API command:
//   • set_color      -> cmd { name: "color", value: {r,g,b} }   (+ optional flash→revertColor)
//   • set_brightness -> cmd { name: "brightness", value: 0-100 }
//   • turn           -> cmd { name: "turn", value: "on" | "off" }
// `revertAfterMs` (optional) tells the actuator to undo after N ms (e.g. flash red 4s → rest).
// Reuses the generic alert-trigger vocabulary + revert bounds from obs-rules (same alerts).
import { ALERT_TRIGGER_TYPES, ANY_TRIGGER, REVERT_MIN_MS, REVERT_MAX_MS, type AlertLike } from "@/lib/obs-rules";

export { ALERT_TRIGGER_TYPES, ANY_TRIGGER, REVERT_MIN_MS, REVERT_MAX_MS };
export type { AlertLike };

/** The Govee action kinds the actuator knows how to send. */
export const GOVEE_ACTION_KINDS = ["set_color", "set_brightness", "turn"] as const;
export type GoveeActionKind = (typeof GOVEE_ACTION_KINDS)[number];

/** Brightness range accepted by the Govee `brightness` command. */
export const BRIGHTNESS_MIN = 0;
export const BRIGHTNESS_MAX = 100;

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

/** Normalize a 6-digit hex color to `#rrggbb` lowercase, or null if invalid. */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  if (!HEX_RE.test(v)) return null;
  return "#" + v.replace(/^#/, "").toLowerCase();
}

export type GoveeAction =
  // Set a color; optionally flash it then revert to `revertColor` after `revertAfterMs`.
  | { kind: "set_color"; color: string; revertColor?: string | null; revertAfterMs?: number | null }
  | { kind: "set_brightness"; brightness: number; revertAfterMs?: number | null }
  | { kind: "turn"; on: boolean; revertAfterMs?: number | null };

/** A streamer-defined rule: when an alert of `triggerType` (and ≥ `minAmount`) fires, run `action`. */
export type GoveeRule = {
  id?: string;
  enabled: boolean;
  /** A StreamAlert.type, or ANY_TRIGGER ("*") to match every alert. */
  triggerType: string;
  /** Only fire when (alert.amount ?? 0) >= minAmount. null/undefined = no threshold. */
  minAmount?: number | null;
  action: GoveeAction;
  /** Lower runs first when several rules match the same alert. */
  sortOrder?: number;
};

/**
 * Resolve the Govee actions to actuate for a given alert, honouring enabled flag, trigger
 * type (exact or "*"), amount threshold, and sort order. Pure: never mutates `rules`,
 * never touches DB/network. (Same semantics as obsActionsForAlert.)
 */
export function goveeActionsForAlert(alert: AlertLike, rules: readonly GoveeRule[]): GoveeAction[] {
  const amount = alert.amount ?? 0;
  return rules
    .filter((r) => r.enabled)
    .filter((r) => r.triggerType === ANY_TRIGGER || r.triggerType === alert.type)
    .filter((r) => r.minAmount == null || amount >= r.minAmount)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((r) => r.action);
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function validRevert(ms: unknown): ms is number | null | undefined {
  if (ms == null) return true;
  return typeof ms === "number" && Number.isInteger(ms) && ms >= REVERT_MIN_MS && ms <= REVERT_MAX_MS;
}

/**
 * Validate + normalize an untrusted action descriptor (admin form / API body). Normalizes
 * hex colors and clamps nothing silently — returns a clean GoveeAction or an error message.
 */
export function validateGoveeAction(input: unknown): Result<GoveeAction> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "action must be an object" };
  const a = input as Record<string, unknown>;
  if (typeof a.kind !== "string" || !(GOVEE_ACTION_KINDS as readonly string[]).includes(a.kind)) {
    return { ok: false, error: `action.kind must be one of ${GOVEE_ACTION_KINDS.join(", ")}` };
  }
  const kind: GoveeActionKind = a.kind as GoveeActionKind;
  if (!validRevert(a.revertAfterMs)) {
    return { ok: false, error: `revertAfterMs must be an integer in [${REVERT_MIN_MS}, ${REVERT_MAX_MS}] or null` };
  }
  const revertAfterMs = (a.revertAfterMs ?? null) as number | null;

  if (kind === "set_color") {
    const color = normalizeHex(a.color);
    if (!color) return { ok: false, error: "set_color requires a 6-digit hex color (e.g. #E50914)" };
    let revertColor: string | null = null;
    if (a.revertColor != null) {
      revertColor = normalizeHex(a.revertColor);
      if (!revertColor) return { ok: false, error: "revertColor must be a 6-digit hex color or null" };
    }
    return { ok: true, value: { kind, color, revertColor, revertAfterMs } };
  }
  if (kind === "set_brightness") {
    if (
      typeof a.brightness !== "number" ||
      !Number.isInteger(a.brightness) ||
      a.brightness < BRIGHTNESS_MIN ||
      a.brightness > BRIGHTNESS_MAX
    ) {
      return { ok: false, error: `set_brightness requires an integer brightness in [${BRIGHTNESS_MIN}, ${BRIGHTNESS_MAX}]` };
    }
    return { ok: true, value: { kind, brightness: a.brightness, revertAfterMs } };
  }
  // kind === "turn"
  if (typeof a.on !== "boolean") return { ok: false, error: "turn requires a boolean `on`" };
  return { ok: true, value: { kind, on: a.on, revertAfterMs } };
}

/**
 * Validate + normalize an untrusted rule (admin form / API body). Validates the nested
 * action, the trigger type, the amount threshold and sort order.
 */
export function validateGoveeRule(input: unknown): Result<GoveeRule> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "rule must be an object" };
  const r = input as Record<string, unknown>;

  if (typeof r.triggerType !== "string" || r.triggerType.trim().length === 0) {
    return { ok: false, error: "triggerType is required" };
  }
  const triggerType = r.triggerType.trim();
  if (triggerType !== ANY_TRIGGER && !(ALERT_TRIGGER_TYPES as readonly string[]).includes(triggerType)) {
    return { ok: false, error: `triggerType must be "${ANY_TRIGGER}" or one of ${ALERT_TRIGGER_TYPES.join(", ")}` };
  }

  if (r.minAmount != null) {
    if (typeof r.minAmount !== "number" || !Number.isInteger(r.minAmount) || r.minAmount < 0) {
      return { ok: false, error: "minAmount must be a non-negative integer or null" };
    }
  }
  const minAmount = (r.minAmount ?? null) as number | null;

  if (r.sortOrder != null && (typeof r.sortOrder !== "number" || !Number.isInteger(r.sortOrder))) {
    return { ok: false, error: "sortOrder must be an integer" };
  }

  const action = validateGoveeAction(r.action);
  if (!action.ok) return action;

  return {
    ok: true,
    value: {
      enabled: r.enabled !== false, // default true
      triggerType,
      minAmount,
      action: action.value,
      sortOrder: (r.sortOrder ?? 0) as number,
    },
  };
}
