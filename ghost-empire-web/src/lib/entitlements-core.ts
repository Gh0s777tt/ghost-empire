// src/lib/entitlements-core.ts
// PURE plan/feature logic — deliberately has NO `next/server` (or any server-only) import,
// so client components and the client-safe feature-catalog can import `planHasFeature` /
// `effectivePlan` without dragging server modules into the browser bundle. The request-time
// gate that needs `NextResponse`/Prisma (`requireTenantFeature`, `featureGateResponse`) stays
// in `entitlements.ts`, which re-exports everything here so existing imports keep working.
//
// Three plans, Botrix-style ladder: basic → community core; pro → engagement extras
// (casino, wheel, predictions, overlays, subathon, song queue); elite → power features
// (AI, outgoing webhooks, custom white-label branding). The founder tenant is "elite".

/** Billing tier in force on a portal. */
export type Plan = "basic" | "pro" | "elite";

/** A plan-gated capability. The OWNER feature-toggles (feature-catalog.ts) live on a second
 *  axis and can only NARROW within what the plan already unlocks — never widen it. */
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

/** Coerce an unknown/legacy plan string to a valid Plan (defaults to basic). */
export function normalizePlan(plan: string | null | undefined): Plan {
  return plan === "basic" || plan === "pro" || plan === "elite" ? plan : "basic";
}

/** The plan that is actually in force: an expired paid plan degrades to basic. */
export function effectivePlan(
  plan: string | null | undefined,
  planExpiresAt: Date | null | undefined,
  now = new Date(),
): Plan {
  const p = normalizePlan(plan);
  if (planExpiresAt && planExpiresAt.getTime() < now.getTime()) return "basic";
  return p;
}

/** Does this plan unlock this feature? Pure set membership. */
export function planHasFeature(plan: Plan, feature: Feature): boolean {
  return PLAN_FEATURES[plan].has(feature);
}
