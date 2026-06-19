// src/app/api/admin/payment-methods/route.ts
// Admin CRUD for the streamer's real-money support methods (#514), shown on the
// public /support page. Tenant-scoped end to end (a streamer only ever sees/edits
// their own). GET list · POST create|update|delete|reorder.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
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
  const methods = await prisma.paymentMethod.findMany({
    where: tid ? { tenantId: tid } : {},
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ methods });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }
  const action = String(body.action ?? "");

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
