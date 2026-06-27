// src/app/api/admin/obs-rules/route.ts
// Admin-only CRUD for PHASE 3C "OBS WebSocket" rules (StreamAlert event -> OBS action).
// Tenant-scoped + audit-logged. The pure validation/matching logic is in lib/obs-rules.ts;
// this only persists rules. Dormant until the in-OBS browser-source controller (a later
// slice) reads them and actuates OBS over the WebSocket protocol.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";
import { validateObsRule, type ObsAction } from "@/lib/obs-rules";

const MAX_RULES = 50;

type ObsRuleRow = {
  id: string;
  enabled: boolean;
  triggerType: string;
  minAmount: number | null;
  actionKind: string;
  scene: string | null;
  source: string | null;
  filter: string | null;
  targetState: boolean | null;
  revertAfterMs: number | null;
  sortOrder: number;
};

/** Flatten the discriminated ObsAction into the table's columns. */
function actionToColumns(a: ObsAction) {
  if (a.kind === "switch_scene") {
    return { actionKind: a.kind, scene: a.scene, source: null, filter: null, targetState: null, revertAfterMs: a.revertAfterMs ?? null };
  }
  if (a.kind === "toggle_source") {
    return { actionKind: a.kind, scene: a.scene, source: a.source, filter: null, targetState: a.visible, revertAfterMs: a.revertAfterMs ?? null };
  }
  return { actionKind: a.kind, scene: null, source: a.source, filter: a.filter, targetState: a.enabled, revertAfterMs: a.revertAfterMs ?? null };
}

/** Rebuild the discriminated ObsAction from a row (null if the row is malformed). */
function rowToAction(r: ObsRuleRow): ObsAction | null {
  const revertAfterMs = r.revertAfterMs;
  if (r.actionKind === "switch_scene" && r.scene) return { kind: "switch_scene", scene: r.scene, revertAfterMs };
  if (r.actionKind === "toggle_source" && r.scene && r.source) return { kind: "toggle_source", scene: r.scene, source: r.source, visible: !!r.targetState, revertAfterMs };
  if (r.actionKind === "toggle_filter" && r.source && r.filter) return { kind: "toggle_filter", source: r.source, filter: r.filter, enabled: !!r.targetState, revertAfterMs };
  return null;
}

function serialize(r: ObsRuleRow) {
  return { id: r.id, enabled: r.enabled, triggerType: r.triggerType, minAmount: r.minAmount, sortOrder: r.sortOrder, action: rowToAction(r) };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const rules = await prisma.obsRule.findMany({
    where: { ...(tid ? { tenantId: tid } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ rules: rules.map(serialize) });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const v = validateObsRule(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const tid = await currentTenantId();
  const count = await prisma.obsRule.count({ where: { ...(tid ? { tenantId: tid } : {}) } });
  if (count >= MAX_RULES) return NextResponse.json({ error: `Limit ${MAX_RULES} reguł osiągnięty` }, { status: 400 });

  const created = await prisma.obsRule.create({
    data: {
      tenantId: tid,
      enabled: v.value.enabled,
      triggerType: v.value.triggerType,
      minAmount: v.value.minAmount ?? null,
      sortOrder: v.value.sortOrder ?? 0,
      ...actionToColumns(v.value.action),
    },
  });
  await logAdminAction({ adminId: auth.userId, action: "create_obs_rule", targetType: "obs_rule", targetId: created.id, req });
  return NextResponse.json({ rule: serialize(created) });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const tid = await currentTenantId();
  const existing = await prisma.obsRule.findFirst({ where: { id, ...(tid ? { tenantId: tid } : {}) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const v = validateObsRule(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const updated = await prisma.obsRule.update({
    where: { id },
    data: {
      enabled: v.value.enabled,
      triggerType: v.value.triggerType,
      minAmount: v.value.minAmount ?? null,
      sortOrder: v.value.sortOrder ?? 0,
      ...actionToColumns(v.value.action),
    },
  });
  await logAdminAction({ adminId: auth.userId, action: "update_obs_rule", targetType: "obs_rule", targetId: id, req });
  return NextResponse.json({ rule: serialize(updated) });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const tid = await currentTenantId();
  const existing = await prisma.obsRule.findFirst({ where: { id, ...(tid ? { tenantId: tid } : {}) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.obsRule.delete({ where: { id } });
  await logAdminAction({ adminId: auth.userId, action: "delete_obs_rule", targetType: "obs_rule", targetId: id, req });
  return NextResponse.json({ ok: true });
}
