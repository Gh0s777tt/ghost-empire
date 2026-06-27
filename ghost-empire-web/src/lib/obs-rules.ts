// src/lib/obs-rules.ts
// PHASE 3C — "OBS WebSocket": pure logic that maps an incoming StreamAlert event
// to OBS actions (scene switch / source toggle / filter toggle) per streamer-defined
// rules. This is the TESTABLE CORE — no DB, no network, no obs-websocket-js import.
//
// The actuator (a browser-source controller running inside OBS, shipped in a later
// slice) consumes the ObsAction[] that obsActionsForAlert() produces and translates
// each one into an OBS WebSocket v5 request:
//   • switch_scene  -> SetCurrentProgramScene { sceneName }
//   • toggle_source -> GetSceneItemId + SetSceneItemEnabled { sceneName, sceneItemId, sceneItemEnabled }
//   • toggle_filter -> SetSourceFilterEnabled { sourceName, filterName, filterEnabled }
// `revertAfterMs` (optional) tells the controller to undo the action after N ms
// (e.g. flash a "BIG DONO" scene for 5s, then return). Undo logic lives in the
// controller; here we only describe the desired action + revert window.

/** Stream-alert types that can trigger an OBS rule (mirrors AlertType in lib/alerts.ts). */
export const ALERT_TRIGGER_TYPES = [
  "shop_purchase",
  "event_win",
  "drop_claim_bonus",
  "twitch_sub",
  "twitch_gift_sub",
  "twitch_cheer",
  "donation",
  "welcome",
  "level_up",
] as const;

/** Special triggerType that matches any alert type. */
export const ANY_TRIGGER = "*";

/** The OBS action kinds the controller knows how to actuate. */
export const OBS_ACTION_KINDS = ["switch_scene", "toggle_source", "toggle_filter"] as const;
export type ObsActionKind = (typeof OBS_ACTION_KINDS)[number];

/** Bounds for the optional auto-revert window (0.1 s – 10 min). */
export const REVERT_MIN_MS = 100;
export const REVERT_MAX_MS = 600_000;

export type ObsAction =
  | { kind: "switch_scene"; scene: string; revertAfterMs?: number | null }
  | { kind: "toggle_source"; scene: string; source: string; visible: boolean; revertAfterMs?: number | null }
  | { kind: "toggle_filter"; source: string; filter: string; enabled: boolean; revertAfterMs?: number | null };

/** A streamer-defined rule: when an alert of `triggerType` (and ≥ `minAmount`) fires, run `action`. */
export type ObsRule = {
  id?: string;
  enabled: boolean;
  /** A StreamAlert.type, or ANY_TRIGGER ("*") to match every alert. */
  triggerType: string;
  /** Only fire when (alert.amount ?? 0) >= minAmount. null/undefined = no threshold. */
  minAmount?: number | null;
  action: ObsAction;
  /** Lower runs first when several rules match the same alert. */
  sortOrder?: number;
};

/** The subset of a StreamAlert we evaluate rules against. */
export type AlertLike = { type: string; amount?: number | null };

/**
 * Resolve the OBS actions to actuate for a given alert, honouring enabled flag,
 * trigger type (exact or "*"), amount threshold, and sort order. Pure: never
 * mutates `rules`, never touches DB/network.
 */
export function obsActionsForAlert(alert: AlertLike, rules: readonly ObsRule[]): ObsAction[] {
  const amount = alert.amount ?? 0;
  return rules
    .filter((r) => r.enabled)
    .filter((r) => r.triggerType === ANY_TRIGGER || r.triggerType === alert.type)
    .filter((r) => r.minAmount == null || amount >= r.minAmount)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((r) => r.action);
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validRevert(ms: unknown): ms is number | null | undefined {
  if (ms == null) return true;
  return typeof ms === "number" && Number.isInteger(ms) && ms >= REVERT_MIN_MS && ms <= REVERT_MAX_MS;
}

/**
 * Validate + normalize an untrusted action descriptor (e.g. from an admin form or
 * API body). Trims string names; returns a clean ObsAction or an error message.
 */
export function validateObsAction(input: unknown): Result<ObsAction> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "action must be an object" };
  const a = input as Record<string, unknown>;
  if (typeof a.kind !== "string" || !(OBS_ACTION_KINDS as readonly string[]).includes(a.kind)) {
    return { ok: false, error: `action.kind must be one of ${OBS_ACTION_KINDS.join(", ")}` };
  }
  const kind: ObsActionKind = a.kind as ObsActionKind;
  if (!validRevert(a.revertAfterMs)) {
    return { ok: false, error: `revertAfterMs must be an integer in [${REVERT_MIN_MS}, ${REVERT_MAX_MS}] or null` };
  }
  const revertAfterMs = (a.revertAfterMs ?? null) as number | null;

  if (kind === "switch_scene") {
    if (!nonEmpty(a.scene)) return { ok: false, error: "switch_scene requires a non-empty scene" };
    return { ok: true, value: { kind, scene: a.scene.trim(), revertAfterMs } };
  }
  if (kind === "toggle_source") {
    if (!nonEmpty(a.scene)) return { ok: false, error: "toggle_source requires a non-empty scene" };
    if (!nonEmpty(a.source)) return { ok: false, error: "toggle_source requires a non-empty source" };
    if (typeof a.visible !== "boolean") return { ok: false, error: "toggle_source requires a boolean visible" };
    return { ok: true, value: { kind, scene: a.scene.trim(), source: a.source.trim(), visible: a.visible, revertAfterMs } };
  }
  // kind === "toggle_filter"
  if (!nonEmpty(a.source)) return { ok: false, error: "toggle_filter requires a non-empty source" };
  if (!nonEmpty(a.filter)) return { ok: false, error: "toggle_filter requires a non-empty filter" };
  if (typeof a.enabled !== "boolean") return { ok: false, error: "toggle_filter requires a boolean enabled" };
  return { ok: true, value: { kind, source: a.source.trim(), filter: a.filter.trim(), enabled: a.enabled, revertAfterMs } };
}

/**
 * Validate + normalize an untrusted rule (admin form / API body). Validates the
 * nested action, the trigger type, the amount threshold and sort order.
 */
export function validateObsRule(input: unknown): Result<ObsRule> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "rule must be an object" };
  const r = input as Record<string, unknown>;

  if (!nonEmpty(r.triggerType)) return { ok: false, error: "triggerType is required" };
  const triggerType = r.triggerType.trim();

  if (r.minAmount != null) {
    if (typeof r.minAmount !== "number" || !Number.isInteger(r.minAmount) || r.minAmount < 0) {
      return { ok: false, error: "minAmount must be a non-negative integer or null" };
    }
  }
  const minAmount = (r.minAmount ?? null) as number | null;

  if (r.sortOrder != null && (typeof r.sortOrder !== "number" || !Number.isInteger(r.sortOrder))) {
    return { ok: false, error: "sortOrder must be an integer" };
  }

  const action = validateObsAction(r.action);
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
