// src/app/api/portals/route.ts
// Cross-portal "switch streamers" hub (#508). GET = the portals I can jump to (the
// current one + the ones I follow). POST/DELETE = follow / unfollow the CURRENT
// portal — the tenant is derived from the request Host, never from the body, so a
// viewer can only follow a portal they're actually on (no enumeration / IDOR).
//
// Built on the existing shared identity (one User per person) — NO auth changes.
// Every PortalFollow query is wrapped so that before the table is pushed the hub
// still works (it just shows the current portal with no follows yet), matching the
// codebase's "table not migrated → fall back" convention.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId, getCurrentTenant } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { buildPortalList, type PortalTenant } from "@/lib/portal-hub";

export const dynamic = "force-dynamic";

const TENANT_SELECT = { slug: true, name: true, logoUrl: true, brandColor: true, domain: true } as const;

/** The portal the request is currently on, as a PortalTenant (domain included). */
async function resolveCurrent(tid: string | null): Promise<PortalTenant | null> {
  if (tid) {
    const row = await prisma.tenant.findUnique({ where: { id: tid }, select: TENANT_SELECT });
    if (row) return row;
  }
  // No tenant row (single-tenant / pre-backfill) → use the resolved brand, no domain.
  const b = await getCurrentTenant();
  return { slug: b.slug, name: b.name, logoUrl: b.logoUrl, brandColor: b.brandColor, domain: null };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "auth-required" }, { status: 401 });
  const userId = session.user.id;
  const tid = await currentTenantId();

  const current = await resolveCurrent(tid);

  let followed: PortalTenant[] = [];
  let currentFollowed = false;
  try {
    const rows = await prisma.portalFollow.findMany({
      where: { userId },
      include: { tenant: { select: TENANT_SELECT } },
    });
    followed = rows.map((r) => r.tenant);
    currentFollowed = tid ? rows.some((r) => r.tenantId === tid) : false;
  } catch {
    /* portal_follows not migrated yet → no follows, hub still shows the current portal */
  }

  const portals = buildPortalList(current, followed, current?.slug ?? null);
  return NextResponse.json({
    portals,
    currentFollowed,
    // Can only follow a real tenant row you're actually on (not the fallback).
    canFollowCurrent: !!tid && !currentFollowed,
  });
}

export async function POST(req: Request) {
  return setFollow(req, true);
}

export async function DELETE(req: Request) {
  return setFollow(req, false);
}

async function setFollow(_req: Request, follow: boolean) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "auth-required" }, { status: 401 });
  const userId = session.user.id;

  const tid = await currentTenantId();
  if (!tid) return NextResponse.json({ error: "no-tenant" }, { status: 400 });

  const rl = await rateLimit(`portal-follow:${userId}`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "rate-limited" }, { status: 429, headers: rateLimitHeaders(rl) });

  try {
    if (follow) {
      await prisma.portalFollow.upsert({
        where: { userId_tenantId: { userId, tenantId: tid } },
        create: { userId, tenantId: tid },
        update: {},
      });
    } else {
      await prisma.portalFollow.deleteMany({ where: { userId, tenantId: tid } });
    }
  } catch {
    // Table not migrated yet — surface a clean "not ready" instead of a 500.
    return NextResponse.json({ error: "hub-not-ready" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, following: follow });
}
