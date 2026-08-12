// src/app/api/admin/feature-flags/route.ts
// Per-portal FEATURE SWITCHBOARD — the owner turns catalog features on/off for their own portal.
// GET returns the current validated flags + the effective plan (so the UI can lock plan-gated
// rows). PATCH merges a validated {key:boolean} delta into Tenant.featureFlags.
//
// Deliberately its OWN route, NOT /api/onboarding/my (that one hard-gates on Elite/custom_branding
// — toggling features must work on ANY plan, within what the plan unlocks). Tenant-scoped via
// currentTenantId() (never cross-tenant); only known catalog keys survive (parseFeatureFlags), so
// a crafted body can neither invent flags nor write junk. Turning a feature on/off is audited.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
import { logAdminAction } from "@/lib/audit";
import { createLogger } from "@/lib/logger";
import { parseFeatureFlags } from "@/lib/feature-catalog";
import { effectivePlan, type Plan } from "@/lib/entitlements-core";

export const dynamic = "force-dynamic";

const log = createLogger("admin.feature-flags");

/** Read the current tenant's flags + effective plan. `null` tid (legacy single-tenant) → empty
 *  flags + elite, matching the fail-open posture of the rest of the tenant layer. */
async function loadState(): Promise<{ tid: string | null; featureFlags: Record<string, boolean>; plan: Plan }> {
  const tid = await currentTenantId();
  if (!tid) return { tid: null, featureFlags: {}, plan: "elite" };
  const t = await prisma.tenant
    .findUnique({ where: { id: tid }, select: { featureFlags: true, plan: true, planExpiresAt: true } })
    .catch(() => null);
  return {
    tid,
    featureFlags: parseFeatureFlags(t?.featureFlags),
    plan: effectivePlan(t?.plan, t?.planExpiresAt),
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { featureFlags, plan } = await loadState();
  return NextResponse.json({ featureFlags, plan });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tid, featureFlags: current } = await loadState();
  if (!tid) {
    // No tenant row to scope to (legacy single-tenant / pre-backfill). Nothing to persist per-portal.
    return NextResponse.json({ error: "Brak portalu do zapisu ustawień funkcji" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  // Accept ONLY known catalog keys with boolean values (unknown keys / non-booleans are dropped).
  const delta = parseFeatureFlags(body);
  if (Object.keys(delta).length === 0) {
    return NextResponse.json({ error: "Brak prawidłowych flag funkcji" }, { status: 400 });
  }

  // Merge the delta over the existing validated map (PATCH semantics) and persist.
  const merged = { ...current, ...delta };
  try {
    await prisma.tenant.update({ where: { id: tid }, data: { featureFlags: merged } });
  } catch (e) {
    log.error("feature-flags update failed", e, { tenantId: tid });
    return NextResponse.json({ error: "Nie udało się zapisać" }, { status: 500 });
  }

  await logAdminAction({
    adminId: auth.userId,
    action: "update_integrations",
    targetType: "tenant_feature_flags",
    details: { tenantId: tid, changed: delta },
  }).catch(() => {});

  return NextResponse.json({ ok: true, featureFlags: merged });
}
