// src/lib/feature-gate.ts
// Server-only page gate for per-portal feature flags. Call it at the top of a viewer feature page:
// a portal that DISABLED the feature then returns notFound() instead of rendering it — the same
// pattern the /hub page already uses for `hubEnabled`. This is defense-in-depth BEHIND the nav
// hiding (Header): the nav drops the link, this stops someone hitting the URL directly.
//
// Kept OUT of lib/features.ts (which stays pure so the client nav can import it) because this pulls
// in `next/navigation` + the tenant lookup — both server-only.
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { isFeatureEnabled } from "@/lib/features";

/**
 * `notFound()` when feature `key` is disabled for the current portal; otherwise no-op. Reuses the
 * request-cached tenant row (`getCurrentTenant` is React-`cache()`d), so adding this to a page costs
 * no extra query. Allow-by-default: an un-migrated / legacy portal (empty `disabledFeatures`) renders
 * every feature as before.
 *
 * @param key A key from the catalog in `@/lib/features` (e.g. "shop", "casino", "auctions").
 */
export async function requireFeature(key: string): Promise<void> {
  const tenant = await getCurrentTenant();
  if (!isFeatureEnabled(tenant.disabledFeatures, key)) notFound();
}

/**
 * API variant of {@link requireFeature}: returns a **403 Response** when feature `key` is disabled
 * for the current portal, or `null` when enabled (the caller then continues). Use at the top of a
 * route handler so a toggleable feature's API rejects even if someone bypasses the (404'd) page:
 *
 *   const off = await requireFeatureApi("casino"); if (off) return off;
 *
 * Same allow-by-default + request-cached tenant read as the page gate — no extra query.
 */
export async function requireFeatureApi(key: string): Promise<NextResponse | null> {
  const tenant = await getCurrentTenant();
  if (isFeatureEnabled(tenant.disabledFeatures, key)) return null;
  return NextResponse.json({ error: "Ta funkcja jest wyłączona na tym portalu." }, { status: 403 });
}
