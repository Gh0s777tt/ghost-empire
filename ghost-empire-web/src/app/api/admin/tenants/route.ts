// src/app/api/admin/tenants/route.ts
// Admin-of-admins (Phase 6): list + provision tenants. Platform owner ONLY —
// a tenant's own admin must never see or create other portals.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";
import { validateTenantSlug } from "@/lib/tenants";
import { normalizePlan } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requirePlatformOwner();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, slug: true, name: true, shortName: true, brandColor: true,
      logoUrl: true, ownerHandle: true, tokenName: true, tokenSymbol: true,
      companionDefaultName: true, bgImageUrl: true, socialLinks: true, supportAlertMode: true,
      timezone: true, domain: true,
      plan: true, planExpiresAt: true, createdAt: true,
      _count: { select: { users: true } },
    },
  });
  return NextResponse.json({
    tenants: tenants.map((t) => ({
      ...t,
      planExpiresAt: t.planExpiresAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      users: t._count.users,
      _count: undefined,
    })),
  });
}

export async function POST(req: Request) {
  const gate = await requirePlatformOwner();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: { slug?: string; name?: string; shortName?: string; ownerHandle?: string; plan?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  const slug = (body.slug ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "Nazwa jest wymagana (max 60 znaków)" }, { status: 400 });
  }
  const slugErr = validateTenantSlug(slug);
  if (slugErr) {
    return NextResponse.json({
      error: slugErr === "reserved" ? "Ten slug jest zarezerwowany" : "Slug: 3-32 znaki, małe litery/cyfry/myślniki",
    }, { status: 400 });
  }
  const exists = await prisma.tenant.findUnique({ where: { slug } });
  if (exists) return NextResponse.json({ error: "Slug jest już zajęty" }, { status: 409 });

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name,
      shortName: body.shortName?.trim() || name,
      ownerHandle: body.ownerHandle?.trim() || null,
      // New tenants start on the chosen plan with NO expiry until billing
      // (Stripe step) stamps real periods; manual grants are the pre-Stripe path.
      plan: normalizePlan(body.plan),
    },
  });

  await logAdminAction({
    adminId: gate.userId,
    action: "set_user_role",
    targetType: "tenant_create",
    details: { slug, name, plan: tenant.plan },
    req,
  });

  return NextResponse.json({ ok: true, id: tenant.id, slug: tenant.slug });
}
