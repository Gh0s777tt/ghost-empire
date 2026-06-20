// src/app/api/admin/sponsors/route.ts
// Manage per-portal sponsors/partners shown on /support (#538). Tenant-scoped,
// admin-only, audit-logged. URLs are run through safeMediaUrl so a stored link can
// never be a javascript:/data: payload. Graceful before the table is migrated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { safeMediaUrl } from "@/lib/url-safe";
import { logAdminAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

type SponsorData = { name: string; url: string; logoUrl: string | null; note: string | null; tier: string | null; featured: boolean };

function parse(body: Record<string, unknown>): SponsorData | { error: string } {
  const name = String(body.name ?? "").trim().slice(0, 80);
  const rawUrl = String(body.url ?? "").trim();
  const url = rawUrl ? safeMediaUrl(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`) : null;
  if (!name) return { error: "Nazwa wymagana" };
  if (!url) return { error: "Nieprawidłowy URL" };
  const rawLogo = String(body.logoUrl ?? "").trim();
  const logoUrl = rawLogo ? safeMediaUrl(rawLogo) : null;
  const note = String(body.note ?? "").trim().slice(0, 120) || null;
  const tier = String(body.tier ?? "").trim().slice(0, 24) || null;
  return { name, url, logoUrl, note, tier, featured: !!body.featured };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const sponsors = await prisma.sponsor
    .findMany({ where: tid ? { tenantId: tid } : {}, orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }] })
    .catch(() => []);
  return NextResponse.json({ sponsors });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const tenantWhere = tid ? { tenantId: tid } : {};

  if (action === "create") {
    const parsed = parse(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const count = await prisma.sponsor.count({ where: tenantWhere });
    const created = await prisma.sponsor.create({ data: { ...(tid ? { tenantId: tid } : {}), ...parsed, sortOrder: count } });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "sponsor", targetId: created.id, details: { create: created.name }, req });
    return NextResponse.json({ ok: true, sponsor: created });
  }

  if (action === "update") {
    const id = String(body.id ?? "");
    const parsed = parse(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const data: Record<string, unknown> = { ...parsed };
    if (typeof body.active === "boolean") data.active = body.active;
    const r = await prisma.sponsor.updateMany({ where: { id, ...tenantWhere }, data });
    if (r.count === 0) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "sponsor", targetId: id, req });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const id = String(body.id ?? "");
    await prisma.sponsor.deleteMany({ where: { id, ...tenantWhere } }).catch(() => {});
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "sponsor", targetId: id, req });
    return NextResponse.json({ ok: true });
  }

  if (action === "reorder") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 200) : [];
    await Promise.all(ids.map((id, i) => prisma.sponsor.updateMany({ where: { id, ...tenantWhere }, data: { sortOrder: i } })));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
}
