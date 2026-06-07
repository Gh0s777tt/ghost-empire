// src/app/api/admin/codes/route.ts
// Manage the giveaway-code pool + rotation config (admin only). Action-dispatched
// so the whole feature is one endpoint: add (bulk) | delete | toggle | clear |
// reset_shown | config.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { getCodeConfig } from "@/lib/codes";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: string; [k: string]: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  switch (body.action) {
    case "add": {
      // Bulk add — one code per line. "Label | CODE" splits a label; otherwise the
      // whole line is the code.
      const text = String(body.text ?? "");
      const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500);
      const data = rows
        .map((line) => {
          const sep = line.indexOf("|");
          if (sep >= 0) {
            return { label: line.slice(0, sep).trim() || null, code: line.slice(sep + 1).trim() };
          }
          return { label: null as string | null, code: line };
        })
        .filter((r) => r.code.length > 0)
        .map((r) => ({ label: r.label, code: r.code.slice(0, 200) }));
      if (data.length === 0) return NextResponse.json({ error: "Brak poprawnych kodów" }, { status: 400 });
      const tid = await currentTenantId();
      const created = await prisma.streamCode.createMany({ data: tid ? data.map((d) => ({ ...d, tenantId: tid })) : data });
      await logAdminAction({ adminId: auth.userId, action: "manage_codes", targetType: "code", details: { added: created.count }, req });
      return NextResponse.json({ ok: true, added: created.count });
    }

    case "delete": {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
      const tid = await currentTenantId();
      await prisma.streamCode.deleteMany({ where: { id, ...(tid ? { tenantId: tid } : {}) } });
      return NextResponse.json({ ok: true });
    }

    case "toggle": {
      const id = String(body.id ?? "");
      const tid = await currentTenantId();
      const c = await prisma.streamCode.findFirst({ where: { id, ...(tid ? { tenantId: tid } : {}) } });
      if (!c) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
      const updated = await prisma.streamCode.update({ where: { id }, data: { active: !c.active } });
      return NextResponse.json({ ok: true, active: updated.active });
    }

    case "clear": {
      const tid = await currentTenantId();
      const res = await prisma.streamCode.deleteMany({ where: tid ? { tenantId: tid } : {} });
      const cfg = await getCodeConfig();
      await prisma.codeDropConfig.update({ where: { id: cfg.id }, data: { currentCodeId: null, currentShownAt: null } });
      await logAdminAction({ adminId: auth.userId, action: "manage_codes", targetType: "code", details: { deletedAll: res.count }, req });
      return NextResponse.json({ ok: true, deleted: res.count });
    }

    case "reset_shown": {
      const tid = await currentTenantId();
      await prisma.streamCode.updateMany({ where: tid ? { tenantId: tid } : {}, data: { shownCount: 0, lastShownAt: null } });
      const cfg = await getCodeConfig();
      await prisma.codeDropConfig.update({ where: { id: cfg.id }, data: { currentCodeId: null, currentShownAt: null } });
      return NextResponse.json({ ok: true });
    }

    case "config": {
      const data: Record<string, unknown> = {};
      if (typeof body.enabled === "boolean") data.enabled = body.enabled;
      if (body.intervalSeconds !== undefined) {
        data.intervalSeconds = Math.min(86400, Math.max(10, Math.floor(Number(body.intervalSeconds) || 600)));
      }
      if (typeof body.title === "string") data.title = body.title.slice(0, 80);
      if (typeof body.accentColor === "string") data.accentColor = body.accentColor.slice(0, 16);
      if (Object.keys(data).length === 0) return NextResponse.json({ error: "Brak zmian" }, { status: 400 });
      const cfg = await getCodeConfig(); // ensure the per-tenant row exists
      const updated = await prisma.codeDropConfig.update({ where: { id: cfg.id }, data });
      return NextResponse.json({ ok: true, config: updated });
    }

    default:
      return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
  }
}
