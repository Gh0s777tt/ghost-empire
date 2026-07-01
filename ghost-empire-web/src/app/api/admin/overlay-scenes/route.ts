// src/app/api/admin/overlay-scenes/route.ts
// CRUD for overlay scenes (#550) — saved multi-widget layouts. Tenant-scoped, admin-
// only, audited. Incoming elements are re-validated through parseElements (unknown
// widgets dropped, positions clamped, count capped) before storage. Graceful before
// the table is migrated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { logAdminAction } from "@/lib/audit";
import { parseElements } from "@/lib/overlay-scenes";
import { sceneTemplate } from "@/lib/scene-templates";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const scenes = await prisma.overlayScene
    .findMany({ where: tid ? { tenantId: tid } : {}, orderBy: { createdAt: "asc" }, select: { id: true, name: true, elements: true, updatedAt: true } })
    .catch(() => []);
  return NextResponse.json({ scenes });
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
    const name = String(body.name ?? "").trim().slice(0, 60) || "Scene";
    const created = await prisma.overlayScene.create({ data: { ...(tid ? { tenantId: tid } : {}), name, elements: "[]" } });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "overlay_scene", targetId: created.id, details: { create: name }, req });
    return NextResponse.json({ ok: true, scene: { id: created.id, name: created.name, elements: created.elements } });
  }

  // One-click curated template (#771): create a scene pre-filled with the template's
  // layout. Elements pass through parseElements like any client payload (defense in depth).
  if (action === "apply_template") {
    const tpl = sceneTemplate(body.templateId);
    if (!tpl) return NextResponse.json({ error: "Nieznany szablon" }, { status: 400 });
    const name = String(body.name ?? "").trim().slice(0, 60) || tpl.id;
    const elements = JSON.stringify(parseElements(JSON.stringify(tpl.elements)));
    const created = await prisma.overlayScene.create({ data: { ...(tid ? { tenantId: tid } : {}), name, elements } });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "overlay_scene", targetId: created.id, details: { template: tpl.id }, req });
    return NextResponse.json({ ok: true, scene: { id: created.id, name: created.name, elements: created.elements } });
  }

  if (action === "update") {
    const id = String(body.id ?? "");
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name.trim().slice(0, 60) || "Scene";
    if (body.elements !== undefined) {
      // Re-validate: clamp positions, drop unknown widgets, cap count.
      data.elements = JSON.stringify(parseElements(JSON.stringify(body.elements)));
    }
    const r = await prisma.overlayScene.updateMany({ where: { id, ...tenantWhere }, data });
    if (r.count === 0) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const id = String(body.id ?? "");
    await prisma.overlayScene.deleteMany({ where: { id, ...tenantWhere } }).catch(() => {});
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "overlay_scene", targetId: id, req });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
}
