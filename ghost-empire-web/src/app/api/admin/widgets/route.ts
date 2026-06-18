// src/app/api/admin/widgets/route.ts
// Admin CRUD for user-built custom text widgets (the "widget generator"). Each one
// is rendered by the token-gated /overlay/widget?id= OBS source.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { featureGateResponse } from "@/lib/entitlements";

const POSITIONS = ["top-left", "top-center", "top-right", "center", "bottom-left", "bottom-center", "bottom-right"];

const hex = (v: unknown, fb: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fb);
const clampInt = (v: unknown, min: number, max: number, fb: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fb;
const pctOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.floor(v))) : null;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const widgets = await prisma.customWidget.findMany({
    where: { ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ widgets });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Custom widgets are part of the pro "overlays" feature — block create/update/delete
  // for a tenant whose plan doesn't include it (GET stays open so the panel still lists).
  const gated = await featureGateResponse("overlays");
  if (gated) return gated;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Tenant guard: list/update/delete only see the current tenant's widgets
  // (legacy NULL-tenant rows included until backfill).
  const tid = await currentTenantId();
  const tenantWhere = tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {};

  if (body.action === "create" || body.action === "update") {
    const data = {
      name: String(body.name ?? "").trim().slice(0, 80) || "Widget",
      text: String(body.text ?? "").slice(0, 500),
      accentColor: hex(body.accentColor, "#E50914"),
      textColor: hex(body.textColor, "#ffffff"),
      fontSizePx: clampInt(body.fontSizePx, 10, 120, 28),
      fontFamily: typeof body.fontFamily === "string" ? body.fontFamily.slice(0, 40) : "Inter",
      position: typeof body.position === "string" && POSITIONS.includes(body.position) ? body.position : "top-left",
      showCard: typeof body.showCard === "boolean" ? body.showCard : true,
      bgGradient: typeof body.bgGradient === "boolean" ? body.bgGradient : false,
      bgColor1: hex(body.bgColor1, "#7928ca"),
      bgColor2: hex(body.bgColor2, "#ff0080"),
      bgAngle: clampInt(body.bgAngle, 0, 360, 135),
      posXPct: pctOrNull(body.posXPct),
      posYPct: pctOrNull(body.posYPct),
      scalePct: typeof body.scalePct === "number" && Number.isFinite(body.scalePct) ? Math.min(300, Math.max(25, Math.floor(body.scalePct))) : null,
    };
    if (body.action === "update") {
      if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
      const { count } = await prisma.customWidget.updateMany({
        where: { id: String(body.id), ...tenantWhere },
        data,
      });
      if (count === 0) return NextResponse.json({ error: "Nie znaleziono widgetu" }, { status: 404 });
      const widget = await prisma.customWidget.findUnique({ where: { id: String(body.id) } });
      return NextResponse.json({ ok: true, widget });
    }
    const widget = await prisma.customWidget.create({ data: { ...(tid ? { tenantId: tid } : {}), ...data } });
    return NextResponse.json({ ok: true, widget });
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    const { count } = await prisma.customWidget.deleteMany({
      where: { id: String(body.id), ...tenantWhere },
    });
    if (count === 0) return NextResponse.json({ error: "Nie znaleziono widgetu" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: create | update | delete" }, { status: 400 });
}
