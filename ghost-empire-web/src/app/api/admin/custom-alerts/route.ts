// src/app/api/admin/custom-alerts/route.ts
// Admin: define custom alert templates + fire them into the StreamAlert queue
// (→ shown on the /overlay OBS source). GET list · POST create|update|delete|fire.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const alerts = await prisma.customAlert.findMany({ where: tid ? { tenantId: tid } : {}, orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    customAlerts: alerts.map((a) => ({
      id: a.id, label: a.label, title: a.title, message: a.message, icon: a.icon,
      accent: a.accent, amount: a.amount, amountLabel: a.amountLabel,
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

  const tid = await currentTenantId();

  const numOrNull = (v: unknown) => {
    if (v === "" || v == null) return null;
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : null;
  };

  switch (body.action) {
    case "create":
    case "update": {
      const fields = {
        label: String(body.label ?? "").trim().slice(0, 80),
        title: String(body.title ?? "").trim().slice(0, 120),
        message: String(body.message ?? "").trim().slice(0, 300),
        icon: body.icon ? String(body.icon).slice(0, 16) : "🔔",
        accent: typeof body.accent === "string" && HEX.test(body.accent) ? body.accent : null,
        amount: numOrNull(body.amount),
        amountLabel: body.amountLabel ? String(body.amountLabel).slice(0, 12) : null,
      };
      if (!fields.label || !fields.title) {
        return NextResponse.json({ error: "Nazwa i tytuł są wymagane" }, { status: 400 });
      }
      if (body.action === "create") {
        const created = await prisma.customAlert.create({ data: { ...(tid ? { tenantId: tid } : {}), ...fields } });
        return NextResponse.json({ ok: true, id: created.id });
      }
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
      // Tenant-guarded update.
      const r = await prisma.customAlert.updateMany({ where: { id, ...(tid ? { tenantId: tid } : {}) }, data: fields });
      if (r.count === 0) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    case "delete": {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
      await prisma.customAlert.deleteMany({ where: { id, ...(tid ? { tenantId: tid } : {}) } }).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    case "fire": {
      const id = String(body.id ?? "");
      const ca = await prisma.customAlert.findFirst({ where: { id, ...(tid ? { tenantId: tid } : {}) } });
      if (!ca) return NextResponse.json({ error: "Nie znaleziono alertu" }, { status: 404 });
      // Enqueue directly — custom alerts bypass the per-type enable filter.
      const alert = await prisma.streamAlert.create({
        data: {
          ...(tid ? { tenantId: tid } : {}),
          type: "custom",
          title: ca.title,
          message: ca.message,
          icon: ca.icon,
          amount: ca.amount,
          amountLabel: ca.amountLabel,
          meta: ca.accent ? JSON.stringify({ accent: ca.accent }) : null,
        },
        select: { id: true },
      });
      await logAdminAction({ adminId: auth.userId, action: "test_alert", targetType: "custom_alert", targetId: ca.id, details: { fired: ca.label }, req });
      return NextResponse.json({ ok: true, alertId: alert.id });
    }

    default:
      return NextResponse.json({ error: "action: create | update | delete | fire" }, { status: 400 });
  }
}
