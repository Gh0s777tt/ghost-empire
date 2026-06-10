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
// Pure logic lives in planFeatures/planHasFeature (unit-tested); request-time
// gating goes through requireTenantFeature() for API routes.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

export type Plan = "basic" | "pro" | "elite";

export type Feature =
  // pro
  | "casino"
  | "wheel"
  | "predictions"
  | "overlays"
  | "subathon"
  | "song_queue"
  // elite
  | "ai"
  | "webhooks_out"
  | "custom_branding";

const PRO_FEATURES: Feature[] = ["casino", "wheel", "predictions", "overlays", "subathon", "song_queue"];
const ELITE_FEATURES: Feature[] = [...PRO_FEATURES, "ai", "webhooks_out", "custom_branding"];

const PLAN_FEATURES: Record<Plan, ReadonlySet<Feature>> = {
  basic: new Set<Feature>(),
  pro: new Set<Feature>(PRO_FEATURES),
  elite: new Set<Feature>(ELITE_FEATURES),
};

export function normalizePlan(plan: string | null | undefined): Plan {
  return plan === "basic" || plan === "pro" || plan === "elite" ? plan : "basic";
}

/** The plan that is actually in force: expired paid plans degrade to basic. */
export function effectivePlan(plan: string | null | undefined, planExpiresAt: Date | null | undefined, now = new Date()): Plan {
  const p = normalizePlan(plan);
  if (planExpiresAt && planExpiresAt.getTime() < now.getTime()) return "basic";
  return p;
}

export function planHasFeature(plan: Plan, feature: Feature): boolean {
  return PLAN_FEATURES[plan].has(feature);
}

export type FeatureGate =
  | { ok: true; plan: Plan }
  | { ok: false; status: number; error: string; plan: Plan };

/**
 * Request-time gate for API routes. Resolves the current tenant (Host) and
 * checks its effective plan. No tenant row / legacy single-tenant → allowed
 * (the founder portal predates billing). Throws nothing; returns a verdict.
 */
export async function requireTenantFeature(feature: Feature): Promise<FeatureGate> {
  const tid = await currentTenantId();
  if (!tid) return { ok: true, plan: "elite" };
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: tid },
      select: { plan: true, planExpiresAt: true },
    });
    if (!t) return { ok: true, plan: "elite" };
    const plan = effectivePlan(t.plan, t.planExpiresAt);
    if (planHasFeature(plan, feature)) return { ok: true, plan };
    return {
      ok: false,
      status: 403,
      error: "Ta funkcja nie jest dostępna w obecnym planie portalu",
      plan,
    };
  } catch {
    // DB hiccup → fail OPEN (a billing check must never take the portal down).
    return { ok: true, plan: "elite" };
  }
}

/** Convenience: gate → 403 JSON response, or null when allowed. */
export async function featureGateResponse(feature: Feature): Promise<NextResponse | null> {
  const gate = await requireTenantFeature(feature);
  if (gate.ok) return null;
  return NextResponse.json({ error: gate.error, plan: gate.plan, feature }, { status: gate.status });
}
