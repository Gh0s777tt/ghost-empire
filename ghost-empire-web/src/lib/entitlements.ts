// src/lib/entitlements.ts
// Plan-gated features (SaaS Phase 6). Three plans, Botrix-style ladder:
//   basic → the community core (economy, shop, ranking, events, quests…)
//   pro   → + engagement extras (casino, wheel, predictions, overlays, subathon)
//   elite → + power features (AI assistant/bot persona, outgoing webhooks,
//             custom white-label branding)
// The founder tenant is "elite" with no expiry (schema default), so nothing
// changes for the existing portal. An EXPIRED paid plan degrades to basic —
// the community keeps running; the premium toys pause until renewal.
//
// The PURE plan logic (Plan, Feature, normalizePlan, effectivePlan, planHasFeature) now
// lives in `entitlements-core.ts` so client-safe modules (the feature-catalog, admin UI)
// can import it without pulling `next/server` into the browser bundle. It is re-exported
// here so existing `@/lib/entitlements` imports are unaffected. Request-time gating
// (needs NextResponse + Prisma) stays here in `requireTenantFeature()` / `featureGateResponse()`.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { createLogger } from "@/lib/logger";
import { type Plan, type Feature, effectivePlan, planHasFeature } from "@/lib/entitlements-core";

export { type Plan, type Feature, normalizePlan, effectivePlan, planHasFeature } from "@/lib/entitlements-core";

const log = createLogger("entitlements");

export type FeatureGate =
  | { ok: true; plan: Plan }
  | { ok: false; status: number; error: string; plan: Plan };

/**
 * Request-time gate for API routes. Resolves the current tenant (Host) and
 * checks its effective plan. No tenant row / legacy single-tenant → allowed
 * (the founder portal predates billing). Throws nothing; returns a verdict.
 *
 * @remarks
 * Every "allowed without a plan check" arm below is a deliberate FAIL-OPEN — a
 * billing check must never take a portal down. The behaviour stays, but the two
 * arms that are NOT normal steady state now leave a log line (#audit-arch3):
 * fail-open was previously indistinguishable from "the plan really does cover
 * this", so a misconfigured `NEXT_PUBLIC_ROOT_DOMAIN` or a longer Supabase
 * outage silently unlocked every paid feature for everyone, forever, with
 * nothing in the logs to notice it by. Grep `scope=entitlements` to see it.
 */
export async function requireTenantFeature(feature: Feature): Promise<FeatureGate> {
  const tid = await currentTenantId();
  // Legacy single-tenant path (no Host→tenant mapping at all) — documented and
  // expected, so it stays silent; logging it would drown the two below in noise.
  if (!tid) return { ok: true, plan: "elite" };
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: tid },
      select: { plan: true, planExpiresAt: true },
    });
    if (!t) {
      // Host resolved to a tenant id whose row is gone (deleted portal / stale cache).
      // Not steady state — a persistent one means everyone on that Host gets elite.
      log.warn("tenant row missing for resolved id → feature allowed (fail-open)", { tenantId: tid, feature });
      return { ok: true, plan: "elite" };
    }
    const plan = effectivePlan(t.plan, t.planExpiresAt);
    if (planHasFeature(plan, feature)) return { ok: true, plan };
    return {
      ok: false,
      status: 403,
      error: "Ta funkcja nie jest dostępna w obecnym planie portalu",
      plan,
    };
  } catch (e) {
    // DB hiccup → fail OPEN (a billing check must never take the portal down),
    // but LOUDLY: a hiccup is one line, a broken pool is a flood in the logs.
    log.error("plan lookup failed → feature allowed (fail-open)", e, { tenantId: tid, feature });
    return { ok: true, plan: "elite" };
  }
}

/** Convenience: gate → 403 JSON response, or null when allowed. */
export async function featureGateResponse(feature: Feature): Promise<NextResponse | null> {
  const gate = await requireTenantFeature(feature);
  if (gate.ok) return null;
  return NextResponse.json({ error: gate.error, plan: gate.plan, feature }, { status: gate.status });
}
