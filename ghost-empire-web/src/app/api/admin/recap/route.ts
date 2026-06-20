// src/app/api/admin/recap/route.ts
// AI Stream Recap (#516): generate a post-stream summary and optionally post it to
// a Discord webhook. Admin-only, tenant-scoped. The Discord webhook is stored on the
// tenant's IntegrationConfig. AI is the elite-plan feature — gated + graceful.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
import { requireTenantFeature } from "@/lib/entitlements";
import { rateLimit } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { generateRecap, sendRecapToDiscord } from "@/lib/stream-recap";

export const dynamic = "force-dynamic";

function isDiscordWebhook(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try { const p = new URL(u); return p.protocol === "https:" && /(^|\.)discord(app)?\.com$/.test(p.hostname) && p.pathname.includes("/webhooks/"); }
  catch { return false; }
}

async function configFor(tid: string | null) {
  return tid
    ? prisma.integrationConfig.findUnique({ where: { tenantId: tid }, select: { recapDiscordWebhook: true } })
    : prisma.integrationConfig.findFirst({ select: { recapDiscordWebhook: true } });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const cfg = await configFor(tid).catch(() => null);
  return NextResponse.json({ hasWebhook: !!cfg?.recapDiscordWebhook });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  let body: { action?: string; url?: string; locale?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }
  const locale = typeof body.locale === "string" && body.locale ? body.locale : "pl";

  if (body.action === "save-webhook") {
    const url = body.url?.trim() ?? "";
    if (url && !isDiscordWebhook(url)) return NextResponse.json({ error: "To nie jest prawidłowy webhook Discord" }, { status: 400 });
    // Upsert the tenant's config row (clearing = empty string → null).
    await prisma.integrationConfig.upsert({
      where: { tenantId: tid ?? "__none__" },
      create: { ...(tid ? { tenantId: tid } : {}), recapDiscordWebhook: url || null },
      update: { recapDiscordWebhook: url || null },
    }).catch(async () => {
      // No tenantId (single-tenant fallback) — update the first row instead.
      const first = await prisma.integrationConfig.findFirst({ select: { id: true } });
      if (first) await prisma.integrationConfig.update({ where: { id: first.id }, data: { recapDiscordWebhook: url || null } });
    });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "recap_webhook", req });
    return NextResponse.json({ ok: true, hasWebhook: !!url });
  }

  // Elite-plan AI gate (applies to generate + post).
  const gate = await requireTenantFeature("ai");
  if (!gate.ok) return NextResponse.json({ error: "ai-unavailable" }, { status: 503 });

  if (body.action === "generate" || body.action === "post") {
    // Cost guard on the real LLM call — every other AI endpoint self-limits (#audit-v2).
    const rl = await rateLimit(`recap:${auth.userId}`, 10, 5 * 60_000);
    if (!rl.allowed) return NextResponse.json({ error: "rate-limited" }, { status: 429 });
    const recap = await generateRecap(tid, locale);
    if (!recap.ok) {
      return NextResponse.json({ error: recap.reason === "no-ai" ? "ai-unavailable" : "ai-failed", data: recap.data }, { status: recap.reason === "no-ai" ? 503 : 502 });
    }

    if (body.action === "post") {
      const cfg = await configFor(tid).catch(() => null);
      if (!cfg?.recapDiscordWebhook) return NextResponse.json({ error: "no-webhook", text: recap.text }, { status: 400 });
      const sent = await sendRecapToDiscord(cfg.recapDiscordWebhook, recap.text);
      await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "recap_post", req });
      return NextResponse.json({ ok: sent, posted: sent, text: recap.text, data: recap.data });
    }

    return NextResponse.json({ ok: true, text: recap.text, data: recap.data });
  }

  return NextResponse.json({ error: "action: save-webhook | generate | post" }, { status: 400 });
}
