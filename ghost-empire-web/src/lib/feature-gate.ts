// src/lib/feature-gate.ts
// Server-side gate for the per-portal OWNER feature switchboard (feature-catalog.ts). This is the
// SECOND axis on top of plan entitlements (entitlements.ts): even when the plan unlocks a feature,
// the owner may have turned it off for their portal — then viewers must not reach it either.
//
// Mirrors entitlements.ts's posture exactly: Host → tenant, read featureFlags + plan, isFeatureLive,
// and FAIL-OPEN on any missing-tenant / DB error (a gate must never take a portal down) but LOUDLY.
// Pages call `isFeatureLiveForRequest(key)` and `notFound()` when false; data routes call
// `featureFlagGateResponse(key)` and return it when non-null.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { createLogger } from "@/lib/logger";
import { effectivePlan } from "@/lib/entitlements-core";
import { isFeatureLive, parseFeatureFlags } from "@/lib/feature-catalog";

const log = createLogger("feature-gate");

/**
 * Is a catalog feature LIVE for the current request's portal — owner flag ON *and* plan allows it?
 * FAIL-OPEN: no tenant (legacy single-tenant / founder pre-row) or a DB hiccup returns `true`, so a
 * switchboard gate can never take a portal down; the two non-steady-state arms leave a log line.
 */
export async function isFeatureLiveForRequest(key: string): Promise<boolean> {
  const tid = await currentTenantId();
  if (!tid) return true; // no Host→tenant mapping — nothing to gate (documented, silent)
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: tid },
      select: { featureFlags: true, plan: true, planExpiresAt: true },
    });
    if (!t) {
      log.warn("tenant row missing for resolved id → feature allowed (fail-open)", { tenantId: tid, key });
      return true;
    }
    return isFeatureLive(parseFeatureFlags(t.featureFlags), effectivePlan(t.plan, t.planExpiresAt), key);
  } catch (e) {
    log.error("feature-flag lookup failed → feature allowed (fail-open)", e, { tenantId: tid, key });
    return true;
  }
}

/** Data-route gate: a 403 JSON when the owner has turned the feature off (or the plan lacks it),
 *  else null. Kept separate from the plan gate (featureGateResponse) so both axes can be applied. */
export async function featureFlagGateResponse(key: string): Promise<NextResponse | null> {
  if (await isFeatureLiveForRequest(key)) return null;
  return NextResponse.json({ error: "Ta funkcja jest wyłączona na tym portalu", feature: key }, { status: 403 });
}
