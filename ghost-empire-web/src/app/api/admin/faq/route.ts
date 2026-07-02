// src/app/api/admin/faq/route.ts
// CRUD for FAQ / auto-responses. Admin-only. The bot reads enabled ones from
// /api/bot/faq and replies on keyword match. Mirrors /api/admin/chat-commands.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";
import { clampInt } from "@/lib/utils";

const MATCH_TYPES = ["contains", "word"] as const;
const MAX_KEYWORD = 100;
const MAX_RESPONSE = 500;
const MAX_COOLDOWN = 3600;

function clampCooldown(v: unknown): number {
  return clampInt(v, 0, MAX_COOLDOWN, 30);
}

type Row = {
  id: string; keyword: string; matchType: string; response: string;
  cooldownSeconds: number; enabled: boolean; createdAt: Date; updatedAt: Date;
};
function serialize(f: Row) {
  return {
    id: f.id, keyword: f.keyword, matchType: f.matchType, response: f.response,
    cooldownSeconds: f.cooldownSeconds, enabled: f.enabled,
    createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString(),
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const faqs = await prisma.faqResponse.findMany({
    where: { ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
    orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ faqs: faqs.map(serialize), matchTypes: MATCH_TYPES });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    action?: string;
    id?: string;
    keyword?: string;
    matchType?: string;
    response?: string;
    cooldownSeconds?: number;
    enabled?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tid = await currentTenantId();

  if (body.action === "create") {
    if (typeof body.keyword !== "string" || !body.keyword.trim() || body.keyword.length > MAX_KEYWORD) {
      return NextResponse.json({ error: `Słowo kluczowe: 1-${MAX_KEYWORD} znaków` }, { status: 400 });
    }
    if (typeof body.response !== "string" || !body.response.trim() || body.response.length > MAX_RESPONSE) {
      return NextResponse.json({ error: `Odpowiedź: 1-${MAX_RESPONSE} znaków` }, { status: 400 });
    }
    const matchType = MATCH_TYPES.includes(body.matchType as (typeof MATCH_TYPES)[number]) ? body.matchType! : "contains";

    const created = await prisma.faqResponse.create({
      data: {
        tenantId: tid,
        keyword: body.keyword.trim(),
        matchType,
        response: body.response.trim(),
        cooldownSeconds: clampCooldown(body.cooldownSeconds),
        createdById: auth.userId,
      },
    });
    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "faq_create",
      targetId: created.id,
      details: { keyword: created.keyword },
      req,
    });
    return NextResponse.json({ ok: true, faq: serialize(created) });
  }

  if (body.action === "update") {
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const owned = await prisma.faqResponse.findFirst({ where: { id: body.id, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) } });
    if (!owned) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    const patch: Record<string, unknown> = {};
    if (typeof body.keyword === "string") {
      if (!body.keyword.trim() || body.keyword.length > MAX_KEYWORD) {
        return NextResponse.json({ error: `Słowo kluczowe: 1-${MAX_KEYWORD} znaków` }, { status: 400 });
      }
      patch.keyword = body.keyword.trim();
    }
    if (typeof body.response === "string") {
      if (!body.response.trim() || body.response.length > MAX_RESPONSE) {
        return NextResponse.json({ error: `Odpowiedź: 1-${MAX_RESPONSE} znaków` }, { status: 400 });
      }
      patch.response = body.response.trim();
    }
    if (MATCH_TYPES.includes(body.matchType as (typeof MATCH_TYPES)[number])) patch.matchType = body.matchType;
    if (body.cooldownSeconds !== undefined) patch.cooldownSeconds = clampCooldown(body.cooldownSeconds);
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

    const updated = await prisma.faqResponse.update({ where: { id: body.id }, data: patch });
    return NextResponse.json({ ok: true, faq: serialize(updated) });
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const owned = await prisma.faqResponse.findFirst({ where: { id: body.id, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) } });
    if (!owned) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    await prisma.faqResponse.delete({ where: { id: body.id } });
    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "faq_delete",
      targetId: body.id,
      details: { keyword: owned.keyword },
      req,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: create | update | delete" }, { status: 400 });
}
