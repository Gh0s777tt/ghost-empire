// src/lib/setup-status.ts
// Pure logic for the admin "go-live" setup wizard (#737). Per-step COMPLETION is derived from
// real config by the route (so it self-heals — configure something anywhere and the step ticks);
// this module owns the step CATALOG (order/group/required) + the progress math + the auto-open
// decision. All pure (no DB/network) → unit-tested.

export type SetupGroup = "platform" | "essential" | "engagement" | "activation";

export type SetupStepDef = {
  key: string;
  /** Admin section id to deep-link to (AdminClient `activeSection`). */
  section: string;
  /** Optional steps don't block `allRequiredDone` (the "you're live" gate). */
  optional: boolean;
  group: SetupGroup;
};

// Canonical catalog — array ORDER is the wizard order (required essentials first). Labels/hints
// are NOT here: they live in i18n (`admin.setupStatus.item.<key>.label`/`.hint`) so the wizard +
// dashboard card render them per-locale.
export const SETUP_STEPS: SetupStepDef[] = [
  { key: "twitch", section: "twitch", optional: false, group: "platform" },
  { key: "twitchSubs", section: "twitch", optional: false, group: "platform" },
  { key: "overlay", section: "alerts", optional: false, group: "essential" },
  { key: "kick", section: "kick", optional: true, group: "platform" },
  { key: "youtube", section: "youtube", optional: true, group: "platform" },
  { key: "moderation", section: "moderation", optional: true, group: "engagement" },
  { key: "ai", section: "integrations", optional: true, group: "engagement" },
  // Activation funnel (#772) — the "aha-moment" steps: content that makes the portal worth
  // visiting. Derived from real rows (first shop item / event / payment method / drop), so
  // they tick themselves the moment the streamer creates the thing anywhere in the panel.
  { key: "shopItem", section: "shop", optional: true, group: "activation" },
  { key: "firstEvent", section: "events", optional: true, group: "activation" },
  { key: "payment", section: "payments", optional: true, group: "activation" },
  { key: "firstDrop", section: "drops", optional: true, group: "activation" },
];

export type SetupStep = SetupStepDef & { ok: boolean };

export type SetupProgress = {
  steps: SetupStep[];
  requiredDone: number;
  requiredTotal: number;
  doneAll: number;
  totalAll: number;
  /** True when every NON-optional step is done — the wizard's "go-live" gate. */
  allRequiredDone: boolean;
  /** 0–100 over ALL steps (optional included) — drives the "X% set up" pill. */
  percent: number;
};

/** Project the catalog against a map of which step keys are done. Unknown keys → not done. */
export function computeSetupProgress(okByKey: Record<string, boolean>): SetupProgress {
  const steps: SetupStep[] = SETUP_STEPS.map((s) => ({ ...s, ok: okByKey[s.key] === true }));
  const required = steps.filter((s) => !s.optional);
  const requiredDone = required.filter((s) => s.ok).length;
  const doneAll = steps.filter((s) => s.ok).length;
  return {
    steps,
    requiredDone,
    requiredTotal: required.length,
    doneAll,
    totalAll: steps.length,
    allRequiredDone: requiredDone === required.length,
    percent: steps.length ? Math.round((doneAll / steps.length) * 100) : 0,
  };
}

/**
 * Should the wizard AUTO-OPEN for this portal? Only nudge FRESH portals that haven't yet finished
 * or snoozed the wizard AND still have a required step left. Pure — caller passes `now` (ms) so it
 * stays deterministic/testable.
 */
export function shouldAutoOpenWizard(input: {
  createdAt: Date | null;
  setupCompletedAt: Date | null;
  setupDismissedAt: Date | null;
  allRequiredDone: boolean;
  now: number;
  freshDays?: number;
}): boolean {
  const { createdAt, setupCompletedAt, setupDismissedAt, allRequiredDone, now, freshDays = 30 } = input;
  if (setupCompletedAt || setupDismissedAt) return false; // already handled (done or snoozed)
  if (allRequiredDone) return false; // nothing essential left to do
  if (!createdAt) return false; // no creation stamp (legacy/founder) → don't nag
  const ageDays = (now - createdAt.getTime()) / 86_400_000;
  return ageDays >= 0 && ageDays <= freshDays; // only fresh portals
}
