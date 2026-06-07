// src/app/api/admin/bot-config/route.ts
// PATCH — update bot config (singleton row id="default")
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";

// Per-tenant bot config (get-or-create); legacy id:"default" when no tenant.
async function getBotCfg() {
  const tid = await currentTenantId();
  if (tid) {
    const existing = await prisma.botConfig.findFirst({ where: { tenantId: tid } });
    return existing ?? (await prisma.botConfig.create({ data: { tenantId: tid } }));
  }
  return prisma.botConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

export async function GET() {
  const auth = await requirePermission("manage_shop"); // closest existing perm; could add bot_config later
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const config = await getBotCfg();
  return NextResponse.json(config);
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("manage_shop");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    messageReward?: number;
    messageCooldownSeconds?: number;
    voiceRewardPerMinute?: number;
    voiceTickSeconds?: number;
    afkGivesReward?: boolean;
    mutedGivesReward?: boolean;
    enabled?: boolean;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.messageReward !== undefined) {
    const v = Math.floor(Number(body.messageReward));
    if (!Number.isFinite(v) || v < 0 || v > 10_000) {
      return NextResponse.json({ error: "messageReward 0-10000" }, { status: 400 });
    }
    data.messageReward = v;
  }
  if (body.messageCooldownSeconds !== undefined) {
    const v = Math.floor(Number(body.messageCooldownSeconds));
    if (!Number.isFinite(v) || v < 0 || v > 3600) {
      return NextResponse.json({ error: "messageCooldownSeconds 0-3600" }, { status: 400 });
    }
    data.messageCooldownSeconds = v;
  }
  if (body.voiceRewardPerMinute !== undefined) {
    const v = Math.floor(Number(body.voiceRewardPerMinute));
    if (!Number.isFinite(v) || v < 0 || v > 10_000) {
      return NextResponse.json({ error: "voiceRewardPerMinute 0-10000" }, { status: 400 });
    }
    data.voiceRewardPerMinute = v;
  }
  if (body.voiceTickSeconds !== undefined) {
    const v = Math.floor(Number(body.voiceTickSeconds));
    if (!Number.isFinite(v) || v < 30 || v > 600) {
      return NextResponse.json({ error: "voiceTickSeconds 30-600" }, { status: 400 });
    }
    data.voiceTickSeconds = v;
  }
  if (body.afkGivesReward !== undefined) data.afkGivesReward = !!body.afkGivesReward;
  if (body.mutedGivesReward !== undefined) data.mutedGivesReward = !!body.mutedGivesReward;
  if (body.enabled !== undefined) data.enabled = !!body.enabled;

  const row = await getBotCfg();
  const updated = await prisma.botConfig.update({ where: { id: row.id }, data });

  await logAdminAction({
    adminId: auth.userId,
    action: "set_user_role",
    targetType: "bot_config",
    targetId: "default",
    details: data,
    req,
  });

  return NextResponse.json({ ok: true, config: updated });
}
