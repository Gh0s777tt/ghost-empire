// src/app/api/admin/chat-commands/route.ts
// CRUD for portal-managed chat commands. Admin-only. The bot (ghost-empire-chat)
// reads the ENABLED ones from /api/bot/chat-commands. Mirrors /api/admin/stream-goals.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";

const TRIGGER_RE = /^![a-z0-9_]{1,49}$/; // "!word" — lowercased; 2-50 chars incl. the "!"
const MAX_RESPONSE = 500;
const MAX_COOLDOWN = 3600;

function normalizeTrigger(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  return TRIGGER_RE.test(t) ? t : null;
}

function clampCooldown(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 15;
  return Math.min(MAX_COOLDOWN, Math.max(0, Math.floor(v)));
}

const MAX_ACTIVE_FROM_MINUTE = 1440; // 24h
function clampActiveFrom(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.min(MAX_ACTIVE_FROM_MINUTE, Math.max(0, Math.floor(v)));
}

type Row = {
  id: string; trigger: string; response: string;
  cooldownSeconds: number; enabled: boolean;
  requiresLive: boolean; activeFromMinute: number;
  createdAt: Date; updatedAt: Date;
};
function serialize(c: Row) {
  return {
    id: c.id, trigger: c.trigger, response: c.response,
    cooldownSeconds: c.cooldownSeconds, enabled: c.enabled,
    requiresLive: c.requiresLive, activeFromMinute: c.activeFromMinute,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const commands = await prisma.chatCommand.findMany({
    where: { ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
    orderBy: [{ enabled: "desc" }, { trigger: "asc" }],
  });
  return NextResponse.json({ commands: commands.map(serialize) });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    action?: string;
    id?: string;
    trigger?: string;
    response?: string;
    cooldownSeconds?: number;
    enabled?: boolean;
    requiresLive?: boolean;
    activeFromMinute?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tid = await currentTenantId();

  if (body.action === "create") {
    const trigger = normalizeTrigger(body.trigger);
    if (!trigger) {
      return NextResponse.json({ error: 'Trigger: "!słowo" (małe litery / cyfry / _, 2-50 znaków)' }, { status: 400 });
    }
    if (typeof body.response !== "string" || !body.response.trim() || body.response.length > MAX_RESPONSE) {
      return NextResponse.json({ error: `Odpowiedź: 1-${MAX_RESPONSE} znaków` }, { status: 400 });
    }
    if (await prisma.chatCommand.findFirst({ where: { trigger, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) } })) {
      return NextResponse.json({ error: `Komenda ${trigger} już istnieje` }, { status: 409 });
    }

    const created = await prisma.chatCommand.create({
      data: {
        tenantId: tid,
        trigger,
        response: body.response.trim(),
        cooldownSeconds: clampCooldown(body.cooldownSeconds),
        requiresLive: body.requiresLive === true,
        activeFromMinute: clampActiveFrom(body.activeFromMinute),
        createdById: auth.userId,
      },
    });
    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "chat_command_create",
      targetId: created.id,
      details: { trigger: created.trigger },
      req,
    });
    return NextResponse.json({ ok: true, command: serialize(created) });
  }

  if (body.action === "update") {
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const owned = await prisma.chatCommand.findFirst({ where: { id: body.id, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) } });
    if (!owned) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    const patch: Record<string, unknown> = {};

    if (body.trigger !== undefined) {
      const trigger = normalizeTrigger(body.trigger);
      if (!trigger) {
        return NextResponse.json({ error: 'Trigger: "!słowo" (małe litery / cyfry / _, 2-50 znaków)' }, { status: 400 });
      }
      const clash = await prisma.chatCommand.findFirst({ where: { trigger, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) } });
      if (clash && clash.id !== body.id) {
        return NextResponse.json({ error: `Komenda ${trigger} już istnieje` }, { status: 409 });
      }
      patch.trigger = trigger;
    }
    if (typeof body.response === "string") {
      if (!body.response.trim() || body.response.length > MAX_RESPONSE) {
        return NextResponse.json({ error: `Odpowiedź: 1-${MAX_RESPONSE} znaków` }, { status: 400 });
      }
      patch.response = body.response.trim();
    }
    if (body.cooldownSeconds !== undefined) patch.cooldownSeconds = clampCooldown(body.cooldownSeconds);
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.requiresLive === "boolean") patch.requiresLive = body.requiresLive;
    if (body.activeFromMinute !== undefined) patch.activeFromMinute = clampActiveFrom(body.activeFromMinute);

    const updated = await prisma.chatCommand.update({ where: { id: body.id }, data: patch });
    return NextResponse.json({ ok: true, command: serialize(updated) });
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const owned = await prisma.chatCommand.findFirst({ where: { id: body.id, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) } });
    if (!owned) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    await prisma.chatCommand.delete({ where: { id: body.id } });
    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "chat_command_delete",
      targetId: body.id,
      details: { trigger: owned.trigger },
      req,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: create | update | delete" }, { status: 400 });
}
