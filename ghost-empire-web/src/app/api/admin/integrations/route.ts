// src/app/api/admin/integrations/route.ts
// Admin-only: read (masked) + save runtime/feature API keys. Secrets are never sent
// back to the client in full — only a masked preview + a "has it" flag.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { currentTenantId } from "@/lib/tenant";

const AI_PROVIDERS = ["anthropic", "openai", "grok", "gemini", "deepseek", "bielik"];

// Stored values are encrypted — decrypt before building the masked preview.
function mask(stored: string | null): string | null {
  const s = decryptSecret(stored);
  if (!s) return null;
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

// Per-tenant config row (get-or-create). Before the tenant exists / outside a request,
// tid is null → fall back to the legacy singleton row.
async function getCfg() {
  const tid = await currentTenantId();
  if (tid) {
    const existing = await prisma.integrationConfig.findFirst({ where: { tenantId: tid } });
    return existing ?? (await prisma.integrationConfig.create({ data: { tenantId: tid } }));
  }
  return prisma.integrationConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const c = await getCfg();
  return NextResponse.json({
    aiProvider: c.aiProvider,
    aiModel: c.aiModel ?? "",
    hasAiKey: !!c.aiApiKey, aiKeyPreview: mask(c.aiApiKey),
    hasSentry: !!c.sentryDsn, sentryPreview: mask(c.sentryDsn),
    obsWebsocketUrl: c.obsWebsocketUrl ?? "",
    hasObsPassword: !!c.obsWebsocketPassword, obsPasswordPreview: mask(c.obsWebsocketPassword),
  });
}

// Only updates a secret when a non-empty value is sent; explicit null clears it;
// absent/empty leaves the stored value untouched (so the masked UI never wipes keys).
function setSecret(data: Record<string, unknown>, key: string, val: unknown) {
  if (val === null) { data[key] = null; return; }
  if (typeof val === "string" && val.trim()) data[key] = encryptSecret(val.trim().slice(0, 4000));
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const row = await getCfg();
  const data: Record<string, unknown> = {};
  if (typeof body.aiProvider === "string" && AI_PROVIDERS.includes(body.aiProvider)) data.aiProvider = body.aiProvider;
  if (typeof body.aiModel === "string") data.aiModel = body.aiModel.trim().slice(0, 100) || null;
  if (typeof body.obsWebsocketUrl === "string") data.obsWebsocketUrl = body.obsWebsocketUrl.trim().slice(0, 500) || null;
  setSecret(data, "aiApiKey", body.aiApiKey);
  setSecret(data, "sentryDsn", body.sentryDsn);
  setSecret(data, "obsWebsocketPassword", body.obsWebsocketPassword);

  await prisma.integrationConfig.update({ where: { id: row.id }, data });
  await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "integrations", targetId: "default", req });
  return NextResponse.json({ ok: true });
}
