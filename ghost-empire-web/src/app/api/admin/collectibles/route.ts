// src/app/api/admin/collectibles/route.ts
// CRUD for the collectible-cards catalog (#551). Tenant-scoped, admin-only, audited.
// Image URLs are run through safeMediaUrl. Graceful before the table is migrated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { safeMediaUrl } from "@/lib/url-safe";
import { logAdminAction } from "@/lib/audit";
import { normalizeRarity } from "@/lib/collectibles";

export const dynamic = "force-dynamic";

type CardData = { name: string; description: string | null; rarity: string; emoji: string | null; imageUrl: string | null };

function parse(body: Record<string, unknown>): CardData | { error: string } {
  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!name) return { error: "Nazwa wymagana" };
  const rawImg = String(body.imageUrl ?? "").trim();
  return {
    name,
    description: String(body.description ?? "").trim().slice(0, 300) || null,
    rarity: normalizeRarity(String(body.rarity ?? "")),
    emoji: String(body.emoji ?? "").trim().slice(0, 8) || null,
    imageUrl: rawImg ? safeMediaUrl(rawImg) : null,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const cards = await prisma.collectible
    .findMany({ where: tid ? { tenantId: tid } : {}, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })
    .catch(() => []);
  return NextResponse.json({ cards });
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
    const count = await prisma.collectible.count({ where: tenantWhere });
    const created = await prisma.collectible.create({ data: { ...(tid ? { tenantId: tid } : {}), ...parsed, sortOrder: count } });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "collectible", targetId: created.id, details: { create: created.name }, req });
    return NextResponse.json({ ok: true, card: created });
  }

  if (action === "update") {
    const id = String(body.id ?? "");
    const parsed = parse(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const data: Record<string, unknown> = { ...parsed };
    if (typeof body.active === "boolean") data.active = body.active;
    const r = await prisma.collectible.updateMany({ where: { id, ...tenantWhere }, data });
    if (r.count === 0) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "collectible", targetId: id, req });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const id = String(body.id ?? "");
    await prisma.collectible.deleteMany({ where: { id, ...tenantWhere } }).catch(() => {});
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "collectible", targetId: id, req });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
}
