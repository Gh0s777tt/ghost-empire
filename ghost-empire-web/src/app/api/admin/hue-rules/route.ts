// src/app/api/admin/hue-rules/route.ts
// Admin-only CRUD for per-tenant Philips Hue lighting rules (#817) — a StreamAlert event -> a Hue
// light action. Tenant-scoped + audit-logged. Pure validation/matching lives in lib/hue-rules.ts;
// this only persists. Mirrors /api/admin/govee-rules deliberately, with ONE difference that matters:
//
// Govee is actuated SERVER-side (cloud API). Hue is actuated CLIENT-side, by the in-OBS browser
// source, because the bridge is on the streamer's LAN and no serverless function can reach a private
// address. So these rows are not consumed here — they are shipped to that browser source by
// /api/obs-control/config. A rule saved while the bridge is unconfigured is therefore inert but
// valid, which is why nothing below checks for credentials.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";
import { validateHueRule, type HueAction } from "@/lib/hue-rules";

const MAX_RULES = 50;

type HueRuleRow = {
  id: string;
  enabled: boolean;
  triggerType: string;
  minAmount: number | null;
  lightId: string | null;
  actionKind: string;
  color: string | null;
  revertColor: string | null;
  brightness: number | null;
  turnOn: boolean | null;
  revertAfterMs: number | null;
  sortOrder: number;
};

/**
 * Flatten the discriminated HueAction into the table's columns.
 *
 * `brightness` stores the streamer's PERCENT, not the bridge's 1-254 `bri`: the conversion happens in
 * the actuator (lib/hue-rules.briFromPercent). Storing the bridge value here would make the panel show
 * a number the streamer never typed.
 */
function actionToColumns(a: HueAction) {
  if (a.kind === "set_color") {
    return { actionKind: a.kind, color: a.hex, revertColor: a.revertHex ?? null, brightness: null, turnOn: null, revertAfterMs: a.revertAfterMs ?? null };
  }
  if (a.kind === "set_brightness") {
    return { actionKind: a.kind, color: null, revertColor: null, brightness: a.percent, turnOn: null, revertAfterMs: a.revertAfterMs ?? null };
  }
  return { actionKind: a.kind, color: null, revertColor: null, brightness: null, turnOn: a.on, revertAfterMs: a.revertAfterMs ?? null };
}

/** Row -> the discriminated action, or null when the row lacks what its kind needs. */
function actionFromRow(r: HueRuleRow): HueAction | null {
  const revertAfterMs = r.revertAfterMs;
  if (r.actionKind === "set_color" && r.color) return { kind: "set_color", hex: r.color, revertHex: r.revertColor, revertAfterMs };
  if (r.actionKind === "set_brightness" && r.brightness !== null) return { kind: "set_brightness", percent: r.brightness, revertAfterMs };
  if (r.actionKind === "turn") return { kind: "turn", on: !!r.turnOn, revertAfterMs };
  return null;
}

function serialize(r: HueRuleRow) {
  return { id: r.id, enabled: r.enabled, triggerType: r.triggerType, minAmount: r.minAmount, lightId: r.lightId, sortOrder: r.sortOrder, action: actionFromRow(r) };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const rules = await prisma.hueRule.findMany({
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

  const v = validateHueRule(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const tid = await currentTenantId();
  const count = await prisma.hueRule.count({ where: { ...(tid ? { tenantId: tid } : {}) } });
  if (count >= MAX_RULES) return NextResponse.json({ error: `Limit ${MAX_RULES} reguł osiągnięty` }, { status: 400 });

  const created = await prisma.hueRule.create({
    data: {
      tenantId: tid,
      enabled: v.value.enabled,
      triggerType: v.value.triggerType,
      minAmount: v.value.minAmount ?? null,
      lightId: v.value.lightId ?? null,
      sortOrder: v.value.sortOrder ?? 0,
      ...actionToColumns(v.value.action),
    },
  });
  await logAdminAction({ adminId: auth.userId, action: "create_hue_rule", targetType: "hue_rule", targetId: created.id, req });
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
  const existing = await prisma.hueRule.findFirst({ where: { id, ...(tid ? { tenantId: tid } : {}) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const v = validateHueRule(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const updated = await prisma.hueRule.update({
    where: { id },
    data: {
      enabled: v.value.enabled,
      triggerType: v.value.triggerType,
      minAmount: v.value.minAmount ?? null,
      lightId: v.value.lightId ?? null,
      sortOrder: v.value.sortOrder ?? 0,
      ...actionToColumns(v.value.action),
    },
  });
  await logAdminAction({ adminId: auth.userId, action: "update_hue_rule", targetType: "hue_rule", targetId: id, req });
  return NextResponse.json({ rule: serialize(updated) });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const tid = await currentTenantId();
  const existing = await prisma.hueRule.findFirst({ where: { id, ...(tid ? { tenantId: tid } : {}) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.hueRule.delete({ where: { id } });
  await logAdminAction({ adminId: auth.userId, action: "delete_hue_rule", targetType: "hue_rule", targetId: id, req });
  return NextResponse.json({ ok: true });
}
