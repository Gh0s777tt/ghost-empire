// src/app/api/admin/widgets/route.ts
// Admin CRUD for user-built custom text widgets (the "widget generator"). Each one
// is rendered by the token-gated /overlay/widget?id= OBS source.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const POSITIONS = ["top-left", "top-center", "top-right", "center", "bottom-left", "bottom-center", "bottom-right"];

const hex = (v: unknown, fb: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fb);
const clampInt = (v: unknown, min: number, max: number, fb: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fb;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const widgets = await prisma.customWidget.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ widgets });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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
    };
    if (body.action === "update") {
      if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
      const widget = await prisma.customWidget.update({ where: { id: String(body.id) }, data });
      return NextResponse.json({ ok: true, widget });
    }
    const widget = await prisma.customWidget.create({ data });
    return NextResponse.json({ ok: true, widget });
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    await prisma.customWidget.delete({ where: { id: String(body.id) } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: create | update | delete" }, { status: 400 });
}
