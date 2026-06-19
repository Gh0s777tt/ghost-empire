// src/app/api/admin/sound-rewards/route.ts
// Admin CRUD for the GT sound-redemption catalog. Tenant-scoped.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function isHttpUrl(s: unknown): s is string {
  if (typeof s !== "string") return false;
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const rewards = await prisma.soundReward.findMany({
    where: tid ? { tenantId: tid } : {},
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ rewards });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  let body: { action?: string; id?: string; name?: string; emoji?: string; cost?: number; soundUrl?: string; active?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }

  if (body.action === "create") {
    const name = (body.name ?? "").trim();
    const cost = Math.floor(Number(body.cost));
    if (!name || name.length > 60) return NextResponse.json({ error: "Nazwa 1–60 znaków" }, { status: 400 });
    if (!Number.isFinite(cost) || cost < 1) return NextResponse.json({ error: "Koszt musi być > 0" }, { status: 400 });
    if (!isHttpUrl(body.soundUrl)) return NextResponse.json({ error: "Nieprawidłowy URL dźwięku (http/https)" }, { status: 400 });
    const created = await prisma.soundReward.create({
      data: { ...(tid ? { tenantId: tid } : {}), name, emoji: (body.emoji ?? "").slice(0, 8) || null, cost, soundUrl: body.soundUrl.trim() },
    });
    return NextResponse.json({ ok: true, reward: created });
  }

  if (body.action === "update") {
    if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 60);
    if (typeof body.cost === "number" && body.cost > 0) patch.cost = Math.floor(body.cost);
    if (typeof body.emoji === "string") patch.emoji = body.emoji.slice(0, 8) || null;
    if (isHttpUrl(body.soundUrl)) patch.soundUrl = body.soundUrl.trim();
    if (typeof body.active === "boolean") patch.active = body.active;
    const r = await prisma.soundReward.updateMany({ where: { id: body.id, ...(tid ? { tenantId: tid } : {}) }, data: patch });
    if (r.count === 0) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    await prisma.soundReward.deleteMany({ where: { id: body.id, ...(tid ? { tenantId: tid } : {}) } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: create | update | delete" }, { status: 400 });
}
