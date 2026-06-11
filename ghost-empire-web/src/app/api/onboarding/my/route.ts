// src/app/api/onboarding/my/route.ts
// Self-service for a tenant OWNER (Phase 6 follow-up): read your own portal's
// status and edit its branding. Deliberately narrower than the platform-owner
// API (/api/admin/tenants/[id]) — no slug changes, no plan/expiry changes
// (plans move via billing or the platform owner).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { effectivePlan } from "@/lib/entitlements";
import { logAdminAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

const HEX = /^#[0-9a-f]{6}$/i;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }
  const t = await prisma.tenant.findFirst({
    where: { ownerUserId: session.user.id },
    select: {
      slug: true, name: true, shortName: true, ownerHandle: true,
      tokenName: true, tokenSymbol: true, brandColor: true, logoUrl: true,
      plan: true, planExpiresAt: true, createdAt: true,
      _count: { select: { users: true } },
    },
  });
  if (!t) return NextResponse.json({ tenant: null });
  return NextResponse.json({
    tenant: {
      ...t,
      _count: undefined,
      users: t._count.users,
      planExpiresAt: t.planExpiresAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      effectivePlan: effectivePlan(t.plan, t.planExpiresAt),
    },
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }
  const mine = await prisma.tenant.findFirst({
    where: { ownerUserId: session.user.id },
    select: { id: true, slug: true },
  });
  if (!mine) return NextResponse.json({ error: "Nie masz jeszcze portalu" }, { status: 404 });

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
  str("logoUrl", 300, { allowEmptyNull: true });
  if (typeof body.brandColor === "string" && HEX.test(body.brandColor.trim())) {
    data.brandColor = body.brandColor.trim();
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Brak zmian" }, { status: 400 });
  }

  await prisma.tenant.update({ where: { id: mine.id }, data });
  await logAdminAction({
    adminId: session.user.id,
    action: "set_user_role",
    targetType: "tenant_self_update",
    details: { slug: mine.slug, fields: Object.keys(data) },
    req,
  });
  return NextResponse.json({ ok: true });
}
