// src/app/api/admin/tenants/[id]/route.ts
// Admin-of-admins (Phase 6): edit a tenant's branding / plan. Platform owner ONLY.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";
import { normalizePlan } from "@/lib/entitlements";
import { safeMediaUrl } from "@/lib/url-safe";

export const dynamic = "force-dynamic";

const HEX = /^#[0-9a-f]{6}$/i;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePlatformOwner();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  const str = (k: string, max: number, { allowEmptyNull = false } = {}) => {
    const v = body[k];
    if (typeof v !== "string") return;
    const t = v.trim();
    if (!t && allowEmptyNull) { data[k] = null; return; }
    if (t && t.length <= max) data[k] = t;
  };
  str("name", 60);
  str("shortName", 60);
  str("ownerHandle", 40, { allowEmptyNull: true });
  str("tokenName", 40);
  str("tokenSymbol", 8);
  str("companionDefaultName", 30, { allowEmptyNull: true });
  str("logoUrl", 300, { allowEmptyNull: true });
  // logoUrl renders site-wide as <img src> — only absolute http(s) passes.
  if (typeof data.logoUrl === "string") data.logoUrl = safeMediaUrl(data.logoUrl);
  if (typeof body.brandColor === "string" && HEX.test(body.brandColor.trim())) {
    data.brandColor = body.brandColor.trim();
  }
  if (typeof body.plan === "string") data.plan = normalizePlan(body.plan);
  if (body.planExpiresAt === null) data.planExpiresAt = null;
  else if (typeof body.planExpiresAt === "string" && body.planExpiresAt) {
    const d = new Date(body.planExpiresAt);
    if (!Number.isNaN(d.getTime())) data.planExpiresAt = d;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Brak zmian" }, { status: 400 });
  }

  const updated = await prisma.tenant.updateMany({ where: { id }, data });
  if (updated.count === 0) return NextResponse.json({ error: "Nie znaleziono tenanta" }, { status: 404 });

  await logAdminAction({
    adminId: gate.userId,
    action: "set_user_role",
    targetType: "tenant_update",
    details: { id, fields: Object.keys(data) },
    req,
  });

  return NextResponse.json({ ok: true });
}
