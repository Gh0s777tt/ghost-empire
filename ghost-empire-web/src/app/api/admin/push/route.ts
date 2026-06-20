// src/app/api/admin/push/route.ts
// Admin web-push tools (#537): GET = subscriber count + whether push is configured;
// POST = broadcast a custom message to this portal's subscribers ("notify my
// followers about X"). Tenant-scoped + admin-only + audit-logged. Dormant-safe:
// POST returns not-configured (not an error) until VAPID keys are set.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { isPushConfigured, sendPushToTenant } from "@/lib/web-push";
import { logAdminAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const subscribers = await prisma.pushSubscription.count({ where: { tenantId: tid } }).catch(() => 0);
  return NextResponse.json({ configured: isPushConfigured(), subscribers });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPushConfigured()) return NextResponse.json({ ok: false, reason: "not-configured" });

  let body: { title?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }
  const title = String(body.title ?? "").trim().slice(0, 120);
  const text = String(body.body ?? "").trim().slice(0, 300);
  if (!text) return NextResponse.json({ error: "empty-body" }, { status: 400 });

  const tid = await currentTenantId();
  const res = await sendPushToTenant(tid, { title: title || "📣", body: text, url: "/" });
  await logAdminAction({ adminId: auth.userId, action: "push_broadcast", targetType: "push", details: { sent: res.sent, pruned: res.pruned }, req }).catch(() => {});
  return NextResponse.json({ ok: true, ...res });
}
