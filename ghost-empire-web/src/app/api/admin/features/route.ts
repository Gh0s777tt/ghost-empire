// src/app/api/admin/features/route.ts
// Admin CRUD for per-portal FEATURE FLAGS (/admin#features). GET = the catalog + this portal's
// currently-disabled keys; POST = flip one feature on/off. Tenant-scoped, admin-only, audited.
// Allow-by-default: storing only the DISABLED keys means an empty list = everything on, so an
// un-migrated / brand-new portal behaves exactly as before. Catalog + gating live in @/lib/features.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { logAdminAction } from "@/lib/audit";
import { FEATURES, FEATURE_KEYS } from "@/lib/features";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const row = tid
    ? await prisma.tenant.findUnique({ where: { id: tid }, select: { disabledFeatures: true } }).catch(() => null)
    : null;
  return NextResponse.json({
    // The catalog (client renders toggles from this) + the portal's disabled set.
    features: FEATURES,
    disabled: row?.disabledFeatures ?? [],
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  if (!tid) return NextResponse.json({ error: "Brak portalu (przed migracją tenantów)" }, { status: 400 });

  let body: { key?: unknown; enabled?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }
  const key = String(body.key ?? "");
  const enabled = body.enabled === true; // strict: only a literal true enables; anything else disables
  if (!FEATURE_KEYS.has(key)) return NextResponse.json({ error: "Nieznana funkcja" }, { status: 400 });

  // Read-modify-write the disabled set. Admin-only + low-frequency, so a plain RMW is fine; the
  // Set de-dupes and the result is order-stable enough for a config list.
  const row = await prisma.tenant.findUnique({ where: { id: tid }, select: { disabledFeatures: true } });
  const next = new Set(row?.disabledFeatures ?? []);
  if (enabled) next.delete(key);
  else next.add(key);
  const disabled = [...next];
  await prisma.tenant.update({ where: { id: tid }, data: { disabledFeatures: disabled } });

  await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "tenant", targetId: tid, details: { feature: key, enabled }, req });
  return NextResponse.json({ ok: true, disabled });
}
