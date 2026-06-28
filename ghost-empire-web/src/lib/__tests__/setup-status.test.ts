import { describe, it, expect } from "vitest";
import { computeSetupProgress, shouldAutoOpenWizard, SETUP_STEPS } from "@/lib/setup-status";

const REQUIRED = SETUP_STEPS.filter((s) => !s.optional).map((s) => s.key); // twitch, twitchSubs, overlay
const ALL_OK = Object.fromEntries(SETUP_STEPS.map((s) => [s.key, true]));

describe("computeSetupProgress", () => {
  it("nothing configured → 0 done, no required done, 0%", () => {
    const p = computeSetupProgress({});
    expect(p.doneAll).toBe(0);
    expect(p.requiredDone).toBe(0);
    expect(p.allRequiredDone).toBe(false);
    expect(p.percent).toBe(0);
    expect(p.totalAll).toBe(SETUP_STEPS.length);
    expect(p.requiredTotal).toBe(REQUIRED.length);
  });

  it("all steps done → allRequiredDone + 100%", () => {
    const p = computeSetupProgress(ALL_OK);
    expect(p.doneAll).toBe(SETUP_STEPS.length);
    expect(p.allRequiredDone).toBe(true);
    expect(p.percent).toBe(100);
  });

  it("only the required steps done → allRequiredDone true even with optional missing", () => {
    const okByKey = Object.fromEntries(REQUIRED.map((k) => [k, true]));
    const p = computeSetupProgress(okByKey);
    expect(p.requiredDone).toBe(REQUIRED.length);
    expect(p.allRequiredDone).toBe(true);
    expect(p.doneAll).toBe(REQUIRED.length); // optionals still not done
  });

  it("an optional step alone does NOT satisfy the required gate", () => {
    const p = computeSetupProgress({ ai: true }); // ai is optional
    expect(p.allRequiredDone).toBe(false);
    expect(p.doneAll).toBe(1);
  });

  it("preserves catalog order and ignores unknown keys", () => {
    const p = computeSetupProgress({ twitch: true, nope: true } as Record<string, boolean>);
    expect(p.steps.map((s) => s.key)).toEqual(SETUP_STEPS.map((s) => s.key));
    expect(p.steps.find((s) => s.key === "twitch")?.ok).toBe(true);
    expect(p.doneAll).toBe(1); // "nope" not counted
  });

  it("percent rounds over all steps", () => {
    // 1 of 7 done → 14%
    expect(computeSetupProgress({ twitch: true }).percent).toBe(Math.round((1 / SETUP_STEPS.length) * 100));
  });
});

describe("shouldAutoOpenWizard", () => {
  const now = 1_000_000_000_000;
  const fresh = new Date(now - 2 * 86_400_000); // 2 days old
  const old = new Date(now - 60 * 86_400_000); // 60 days old

  it("fresh portal, nothing required done, not handled → opens", () => {
    expect(
      shouldAutoOpenWizard({ createdAt: fresh, setupCompletedAt: null, setupDismissedAt: null, allRequiredDone: false, now }),
    ).toBe(true);
  });

  it("completed → never opens", () => {
    expect(
      shouldAutoOpenWizard({ createdAt: fresh, setupCompletedAt: new Date(now), setupDismissedAt: null, allRequiredDone: false, now }),
    ).toBe(false);
  });

  it("dismissed/snoozed → never opens", () => {
    expect(
      shouldAutoOpenWizard({ createdAt: fresh, setupCompletedAt: null, setupDismissedAt: new Date(now), allRequiredDone: false, now }),
    ).toBe(false);
  });

  it("all required already done → no need to open", () => {
    expect(
      shouldAutoOpenWizard({ createdAt: fresh, setupCompletedAt: null, setupDismissedAt: null, allRequiredDone: true, now }),
    ).toBe(false);
  });

  it("old portal → don't nag", () => {
    expect(
      shouldAutoOpenWizard({ createdAt: old, setupCompletedAt: null, setupDismissedAt: null, allRequiredDone: false, now }),
    ).toBe(false);
  });

  it("no createdAt (legacy/founder) → don't nag", () => {
    expect(
      shouldAutoOpenWizard({ createdAt: null, setupCompletedAt: null, setupDismissedAt: null, allRequiredDone: false, now }),
    ).toBe(false);
  });
});
