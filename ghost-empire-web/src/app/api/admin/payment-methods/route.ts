// src/app/api/admin/payment-methods/route.ts
// Admin CRUD for the streamer's real-money support methods (#514), shown on the
// public /support page. Tenant-scoped end to end (a streamer only ever sees/edits
// their own). GET list · POST create|update|delete|reorder.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
import { notifyGoalReached } from "@/lib/web-push";
import { logAdminAction } from "@/lib/audit";
import { isPaymentKind, type PaymentKind } from "@/lib/payment-methods";

type MethodData = {
  kind: PaymentKind; label: string; value: string;
  network: string | null; note: string | null; icon: string | null;
  featured: boolean; active: boolean;
};

function isHttpUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try { const p = new URL(u); return p.protocol === "https:" || p.protocol === "http:"; } catch { return false; }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const [methods, goal, tenant] = await Promise.all([
    prisma.paymentMethod.findMany({
      where: tid ? { tenantId: tid } : {},
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    (tid ? prisma.supportGoal.findUnique({ where: { tenantId: tid } }) : prisma.supportGoal.findFirst()).catch(() => null),
    tid ? prisma.tenant.findUnique({ where: { id: tid }, select: { supportHeading: true, supportIntro: true, supportThanks: true } }).catch(() => null) : null,
  ]);
  return NextResponse.json({
    methods,
    goal,
    supportText: { heading: tenant?.supportHeading ?? "", intro: tenant?.supportIntro ?? "", thanks: tenant?.supportThanks ?? "" },
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }
  const action = String(body.action ?? "");

  if (action === "save-goal") {
    const title = String(body.title ?? "").trim().slice(0, 80);
    const target = Math.max(0, Math.floor(Number(body.target ?? 0)));
    const current = Math.max(0, Math.floor(Number(body.current ?? 0)));
    const currency = (String(body.currency ?? "PLN").trim().slice(0, 8) || "PLN").toUpperCase();
    const active = !!body.active;
    if (active && (!title || target < 1)) return NextResponse.json({ error: "Tytuł i cel (≥1) wymagane" }, { status: 400 });
    // Previous collected amount, to detect crossing the target on this save (#535).
    const prev = await (tid
      ? prisma.supportGoal.findUnique({ where: { tenantId: tid }, select: { current: true } })
      : prisma.supportGoal.findFirst({ select: { current: true } })
    ).catch(() => null);
    const data = { title, target, current, currency, active };
    await prisma.supportGoal.upsert({
      where: { tenantId: tid ?? "__none__" },
      create: { ...(tid ? { tenantId: tid } : {}), ...data },
      update: data,
    }).catch(async () => {
      const first = await prisma.supportGoal.findFirst({ select: { id: true } });
      if (first) await prisma.supportGoal.update({ where: { id: first.id }, data });
      else await prisma.supportGoal.create({ data });
    });
    // Just hit the goal this save → "goal reached" web push to subscribers (#535).
    if (active && target >= 1 && (prev?.current ?? 0) < target && current >= target) {
      void notifyGoalReached(tid, title).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  // Per-portal /support copy (#742): the streamer's own headline/intro/thank-you. Empty → null
  // (the page falls back to the localized template). Tenant-scoped to the acting admin's portal.
  if (action === "save-support-text") {
    if (!tid) return NextResponse.json({ ok: true, scoped: false }); // no tenant row (legacy)
    const supportHeading = String(body.supportHeading ?? "").trim().slice(0, 120) || null;
    const supportIntro = String(body.supportIntro ?? "").trim().slice(0, 600) || null;
    const supportThanks = String(body.supportThanks ?? "").trim().slice(0, 200) || null;
    await prisma.tenant.update({ where: { id: tid }, data: { supportHeading, supportIntro, supportThanks } });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "support_text", targetId: "support", req });
    return NextResponse.json({ ok: true });
  }

  // Shared field parsing/validation for create + update.
  function parseFields(): { ok: true; data: MethodData } | { ok: false; error: string } {
    const kind = body.kind;
    if (!isPaymentKind(kind)) return { ok: false, error: "kind: link | crypto | bank" };
    const label = String(body.label ?? "").trim().slice(0, 60);
    const value = String(body.value ?? "").trim().slice(0, 2000);
    if (!label) return { ok: false, error: "Nazwa wymagana" };
    if (!value) return { ok: false, error: "Wartość wymagana" };
    if (kind === "link" && !isHttpUrl(value)) return { ok: false, error: "Link musi być adresem http(s)" };
    return {
      ok: true,
      data: {
        kind,
        label,
        value,
        network: body.network ? String(body.network).trim().slice(0, 60) : null,
        note: body.note ? String(body.note).trim().slice(0, 200) : null,
        icon: body.icon ? String(body.icon).slice(0, 16) : null,
        featured: !!body.featured,
        active: body.active === undefined ? true : !!body.active,
      },
    };
  }

  if (action === "create") {
    const parsed = parseFields();
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const count = await prisma.paymentMethod.count({ where: tid ? { tenantId: tid } : {} });
    const created = await prisma.paymentMethod.create({
      data: { ...(tid ? { tenantId: tid } : {}), ...parsed.data, sortOrder: count },
    });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "payment_method", targetId: created.id, details: { create: created.label }, req });
    return NextResponse.json({ ok: true, id: created.id });
  }

  if (action === "update") {
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    const parsed = parseFields();
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const r = await prisma.paymentMethod.updateMany({ where: { id, ...(tid ? { tenantId: tid } : {}) }, data: parsed.data });
    if (r.count === 0) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "payment_method", targetId: id, req });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    await prisma.paymentMethod.deleteMany({ where: { id, ...(tid ? { tenantId: tid } : {}) } }).catch(() => {});
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "payment_method", targetId: id, req });
    return NextResponse.json({ ok: true });
  }

  if (action === "reorder") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) return NextResponse.json({ error: "Brak ids" }, { status: 400 });
    // Only reorder rows actually owned by this tenant (the updateMany filter enforces it).
    await prisma.$transaction(
      ids.map((id, i) =>
        prisma.paymentMethod.updateMany({ where: { id, ...(tid ? { tenantId: tid } : {}) }, data: { sortOrder: i } }),
      ),
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: create | update | delete | reorder" }, { status: 400 });
}
