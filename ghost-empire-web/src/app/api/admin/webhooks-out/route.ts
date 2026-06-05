// src/app/api/admin/webhooks-out/route.ts
// Admin-only CRUD for outgoing webhooks + a test-fire action. Secrets are stored
// encrypted and never returned to the client.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { WEBHOOK_EVENTS, testOutgoingWebhook } from "@/lib/webhooks-out";

function isHttpUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try { const p = new URL(u); return p.protocol === "https:" || p.protocol === "http:"; } catch { return false; }
}

function cleanEvents(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>([...WEBHOOK_EVENTS, "*"]);
  return [...new Set(raw.map(String).filter((e) => allowed.has(e)))];
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const hooks = await prisma.outgoingWebhook.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({
    events: WEBHOOK_EVENTS,
    webhooks: hooks.map((h) => ({
      id: h.id,
      label: h.label,
      url: h.url,
      events: h.events,
      hasSecret: !!h.secret,
      enabled: h.enabled,
      failCount: h.failCount,
      lastStatus: h.lastStatus,
      lastFiredAt: h.lastFiredAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  const action = String(body.action ?? "");

  if (action === "create") {
    if (!isHttpUrl(body.url)) return NextResponse.json({ error: "Wymagany prawidłowy URL http(s)" }, { status: 400 });
    const created = await prisma.outgoingWebhook.create({
      data: {
        label: String(body.label ?? "Webhook").trim().slice(0, 80) || "Webhook",
        url: body.url.slice(0, 2000),
        events: cleanEvents(body.events),
        secret: typeof body.secret === "string" && body.secret.trim() ? encryptSecret(body.secret.trim().slice(0, 200)) : null,
        enabled: body.enabled !== false,
      },
    });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "outgoing_webhook", targetId: created.id, req });
    return NextResponse.json({ ok: true, id: created.id });
  }

  if (action === "update") {
    if (typeof body.id !== "string") return NextResponse.json({ error: "Brak id" }, { status: 400 });
    const data: Record<string, unknown> = {};
    if (typeof body.label === "string") data.label = body.label.trim().slice(0, 80) || "Webhook";
    if (isHttpUrl(body.url)) data.url = (body.url as string).slice(0, 2000);
    if (body.events !== undefined) data.events = cleanEvents(body.events);
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    // secret: only touch when a value is sent (non-empty = set, explicit null = clear)
    if (body.secret === null) data.secret = null;
    else if (typeof body.secret === "string" && body.secret.trim()) data.secret = encryptSecret(body.secret.trim().slice(0, 200));
    // Re-enabling or editing resets the failure counter so it gets a fresh chance.
    if (data.enabled === true || data.url) data.failCount = 0;

    await prisma.outgoingWebhook.update({ where: { id: body.id }, data });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "outgoing_webhook", targetId: body.id, req });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    if (typeof body.id !== "string") return NextResponse.json({ error: "Brak id" }, { status: 400 });
    await prisma.outgoingWebhook.delete({ where: { id: body.id } }).catch(() => {});
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "outgoing_webhook", targetId: body.id, req });
    return NextResponse.json({ ok: true });
  }

  if (action === "test") {
    if (typeof body.id !== "string") return NextResponse.json({ error: "Brak id" }, { status: 400 });
    const result = await testOutgoingWebhook(body.id);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "action: create | update | delete | test" }, { status: 400 });
}
