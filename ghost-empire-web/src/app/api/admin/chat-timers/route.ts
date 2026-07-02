// src/app/api/admin/chat-timers/route.ts
// CRUD for cyclic chat timers. Admin-only. The bot reads enabled ones from
// /api/bot/chat-timers and broadcasts them. Mirrors /api/admin/chat-commands.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";
import { clampInt } from "@/lib/utils";

const MAX_MESSAGE = 500;
const MIN_INTERVAL = 60;        // 1 min
const MAX_INTERVAL = 86_400;    // 24 h

function clampInterval(v: unknown): number {
  return clampInt(v, MIN_INTERVAL, MAX_INTERVAL, 900);
}

type Row = {
  id: string; message: string; intervalSeconds: number;
  enabled: boolean; createdAt: Date; updatedAt: Date;
};
function serialize(t: Row) {
  return {
    id: t.id, message: t.message, intervalSeconds: t.intervalSeconds,
    enabled: t.enabled, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const timers = await prisma.chatTimer.findMany({
    where: { ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
    orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ timers: timers.map(serialize) });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    action?: string;
    id?: string;
    message?: string;
    intervalSeconds?: number;
    enabled?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tid = await currentTenantId();

  if (body.action === "create") {
    if (typeof body.message !== "string" || !body.message.trim() || body.message.length > MAX_MESSAGE) {
      return NextResponse.json({ error: `Wiadomość: 1-${MAX_MESSAGE} znaków` }, { status: 400 });
    }
    const created = await prisma.chatTimer.create({
      data: {
        tenantId: tid,
        message: body.message.trim(),
        intervalSeconds: clampInterval(body.intervalSeconds),
        createdById: auth.userId,
      },
    });
    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "chat_timer_create",
      targetId: created.id,
      details: { intervalSeconds: created.intervalSeconds },
      req,
    });
    return NextResponse.json({ ok: true, timer: serialize(created) });
  }

  if (body.action === "update") {
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const owned = await prisma.chatTimer.findFirst({ where: { id: body.id, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) } });
    if (!owned) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    const patch: Record<string, unknown> = {};
    if (typeof body.message === "string") {
      if (!body.message.trim() || body.message.length > MAX_MESSAGE) {
        return NextResponse.json({ error: `Wiadomość: 1-${MAX_MESSAGE} znaków` }, { status: 400 });
      }
      patch.message = body.message.trim();
    }
    if (body.intervalSeconds !== undefined) patch.intervalSeconds = clampInterval(body.intervalSeconds);
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

    const updated = await prisma.chatTimer.update({ where: { id: body.id }, data: patch });
    return NextResponse.json({ ok: true, timer: serialize(updated) });
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const owned = await prisma.chatTimer.findFirst({ where: { id: body.id, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) } });
    if (!owned) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    await prisma.chatTimer.delete({ where: { id: body.id } });
    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "chat_timer_delete",
      targetId: body.id,
      details: { intervalSeconds: owned.intervalSeconds },
      req,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: create | update | delete" }, { status: 400 });
}
