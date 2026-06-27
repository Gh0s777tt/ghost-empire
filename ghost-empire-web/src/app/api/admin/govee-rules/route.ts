// src/app/api/admin/govee-rules/route.ts
// Admin-only CRUD for per-tenant Govee lighting rules (#720) — a StreamAlert event -> a Govee
// light action. Tenant-scoped + audit-logged. Pure validation/matching is in lib/govee-rules.ts;
// this only persists rules. The server-side actuator (lib/govee.ts, a later slice) reads them
// + the tenant's Govee creds and calls the cloud API. Mirrors /api/admin/obs-rules.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";
import { validateGoveeRule, type GoveeAction } from "@/lib/govee-rules";

const MAX_RULES = 50;

type GoveeRuleRow = {
  id: string;
  enabled: boolean;
  triggerType: string;
  minAmount: number | null;
  actionKind: string;
  color: string | null;
  revertColor: string | null;
  brightness: number | null;
  turnOn: boolean | null;
  revertAfterMs: number | null;
  sortOrder: number;
};

/** Flatten the discriminated GoveeAction into the table's columns. */
function actionToColumns(a: GoveeAction) {
  if (a.kind === "set_color") {
    return { actionKind: a.kind, color: a.color, revertColor: a.revertColor ?? null, brightness: null, turnOn: null, revertAfterMs: a.revertAfterMs ?? null };
  }
  if (a.kind === "set_brightness") {
    return { actionKind: a.kind, color: null, revertColor: null, brightness: a.brightness, turnOn: null, revertAfterMs: a.revertAfterMs ?? null };
  }
  return { actionKind: a.kind, color: null, revertColor: null, brightness: null, turnOn: a.on, revertAfterMs: a.revertAfterMs ?? null };
}

/** Rebuild the discriminated GoveeAction from a row (null if the row is malformed). */
function rowToAction(r: GoveeRuleRow): GoveeAction | null {
  const revertAfterMs = r.revertAfterMs;
  if (r.actionKind === "set_color" && r.color) return { kind: "set_color", color: r.color, revertColor: r.revertColor ?? null, revertAfterMs };
  if (r.actionKind === "set_brightness" && r.brightness != null) return { kind: "set_brightness", brightness: r.brightness, revertAfterMs };
  if (r.actionKind === "turn" && r.turnOn != null) return { kind: "turn", on: r.turnOn, revertAfterMs };
  return null;
}

function serialize(r: GoveeRuleRow) {
  return { id: r.id, enabled: r.enabled, triggerType: r.triggerType, minAmount: r.minAmount, sortOrder: r.sortOrder, action: rowToAction(r) };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const rules = await prisma.goveeRule.findMany({
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

  const v = validateGoveeRule(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const tid = await currentTenantId();
  const count = await prisma.goveeRule.count({ where: { ...(tid ? { tenantId: tid } : {}) } });
  if (count >= MAX_RULES) return NextResponse.json({ error: `Limit ${MAX_RULES} reguł osiągnięty` }, { status: 400 });

  const created = await prisma.goveeRule.create({
    data: {
      tenantId: tid,
      enabled: v.value.enabled,
      triggerType: v.value.triggerType,
      minAmount: v.value.minAmount ?? null,
      sortOrder: v.value.sortOrder ?? 0,
      ...actionToColumns(v.value.action),
    },
  });
  await logAdminAction({ adminId: auth.userId, action: "create_govee_rule", targetType: "govee_rule", targetId: created.id, req });
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
  const existing = await prisma.goveeRule.findFirst({ where: { id, ...(tid ? { tenantId: tid } : {}) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const v = validateGoveeRule(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const updated = await prisma.goveeRule.update({
    where: { id },
    data: {
      enabled: v.value.enabled,
      triggerType: v.value.triggerType,
      minAmount: v.value.minAmount ?? null,
      sortOrder: v.value.sortOrder ?? 0,
      ...actionToColumns(v.value.action),
    },
  });
  await logAdminAction({ adminId: auth.userId, action: "update_govee_rule", targetType: "govee_rule", targetId: id, req });
  return NextResponse.json({ rule: serialize(updated) });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const tid = await currentTenantId();
  const existing = await prisma.goveeRule.findFirst({ where: { id, ...(tid ? { tenantId: tid } : {}) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.goveeRule.delete({ where: { id } });
  await logAdminAction({ adminId: auth.userId, action: "delete_govee_rule", targetType: "govee_rule", targetId: id, req });
  return NextResponse.json({ ok: true });
}
