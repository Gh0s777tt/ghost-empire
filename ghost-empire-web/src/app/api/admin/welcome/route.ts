// src/app/api/admin/welcome/route.ts
// Read/update the welcome singleton config. Admin-only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";

const MAX_TEMPLATE = 300;

// Per-tenant welcome config (get-or-create); legacy id:"default" when no tenant.
async function getWelcomeCfg() {
  const tid = await currentTenantId();
  if (tid) {
    const existing = await prisma.welcomeConfig.findFirst({ where: { tenantId: tid } });
    return existing ?? (await prisma.welcomeConfig.create({ data: { tenantId: tid } }));
  }
  return prisma.welcomeConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const config = await getWelcomeCfg();
  return NextResponse.json({
    config: {
      enabled: config.enabled,
      template: config.template,
      bonusTokens: config.bonusTokens,
      updatedAt: config.updatedAt.toISOString(),
    },
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { enabled?: boolean; template?: string; bonusTokens?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.template === "string") {
    const t = body.template.trim();
    if (!t || t.length > MAX_TEMPLATE) {
      return NextResponse.json({ error: `Szablon: 1-${MAX_TEMPLATE} znaków` }, { status: 400 });
    }
    patch.template = t;
  }
  if (typeof body.bonusTokens === "number" && Number.isFinite(body.bonusTokens)) {
    patch.bonusTokens = Math.min(5000, Math.max(0, Math.floor(body.bonusTokens)));
  }

  const row = await getWelcomeCfg();
  const config = await prisma.welcomeConfig.update({ where: { id: row.id }, data: patch });
  await logAdminAction({
    adminId: auth.userId,
    action: "set_user_role",
    targetType: "welcome_config",
    targetId: "default",
    details: { enabled: config.enabled },
    req,
  });
  return NextResponse.json({
    ok: true,
    config: { enabled: config.enabled, template: config.template, bonusTokens: config.bonusTokens, updatedAt: config.updatedAt.toISOString() },
  });
}
