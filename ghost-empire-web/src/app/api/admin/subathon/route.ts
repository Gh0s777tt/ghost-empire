// src/app/api/admin/subathon/route.ts
// Subathon control. Admin-only. The timer is extended automatically by the event
// handlers (see lib/subathon.ts); here the streamer starts/stops/adjusts it.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";

const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;

type Row = {
  active: boolean; endsAt: Date | null; startedAt: Date | null;
  secondsPerSub: number; secondsPerPln: number; maxEndsAt: Date | null; totalAddedSecs: number;
};
function serialize(s: Row) {
  return {
    active: s.active,
    endsAt: s.endsAt?.toISOString() ?? null,
    startedAt: s.startedAt?.toISOString() ?? null,
    secondsPerSub: s.secondsPerSub,
    secondsPerPln: s.secondsPerPln,
    maxEndsAt: s.maxEndsAt?.toISOString() ?? null,
    totalAddedSecs: s.totalAddedSecs,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const s = await prisma.subathon.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  return NextResponse.json({ subathon: serialize(s) });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    action?: string;
    minutes?: number;
    addMinutes?: number;
    secondsPerSub?: number;
    secondsPerPln?: number;
    maxMinutes?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const now = Date.now();

  if (body.action === "start") {
    const minutes = clampInt(body.minutes, 1, 100_000, 60);
    const secondsPerSub = clampInt(body.secondsPerSub, 0, 86_400, 300);
    const secondsPerPln = clampInt(body.secondsPerPln, 0, 86_400, 60);
    const maxEndsAt =
      typeof body.maxMinutes === "number" && body.maxMinutes > 0
        ? new Date(now + clampInt(body.maxMinutes, 1, 1_000_000, minutes) * 60_000)
        : null;
    const updated = await prisma.subathon.upsert({
      where: { id: "default" },
      create: {
        id: "default", active: true, startedAt: new Date(now), endsAt: new Date(now + minutes * 60_000),
        secondsPerSub, secondsPerPln, maxEndsAt, totalAddedSecs: 0,
      },
      update: {
        active: true, startedAt: new Date(now), endsAt: new Date(now + minutes * 60_000),
        secondsPerSub, secondsPerPln, maxEndsAt, totalAddedSecs: 0,
      },
    });
    await logAdminAction({ adminId: auth.userId, action: "set_user_role", targetType: "subathon_start", targetId: "default", details: { minutes, secondsPerSub, secondsPerPln }, req });
    return NextResponse.json({ ok: true, subathon: serialize(updated) });
  }

  if (body.action === "stop") {
    const updated = await prisma.subathon.upsert({ where: { id: "default" }, create: { id: "default", active: false }, update: { active: false } });
    await logAdminAction({ adminId: auth.userId, action: "set_user_role", targetType: "subathon_stop", targetId: "default", req });
    return NextResponse.json({ ok: true, subathon: serialize(updated) });
  }

  if (body.action === "addTime") {
    if (typeof body.addMinutes !== "number" || !Number.isFinite(body.addMinutes)) {
      return NextResponse.json({ error: "addMinutes wymagane" }, { status: 400 });
    }
    const s = await prisma.subathon.findUnique({ where: { id: "default" } });
    if (!s) return NextResponse.json({ error: "Brak subathonu" }, { status: 400 });
    const base = Math.max(now, s.endsAt?.getTime() ?? now);
    const next = new Date(Math.max(now, base + Math.floor(body.addMinutes) * 60_000));
    const updated = await prisma.subathon.update({ where: { id: "default" }, data: { endsAt: next } });
    return NextResponse.json({ ok: true, subathon: serialize(updated) });
  }

  if (body.action === "settings") {
    const patch: Record<string, number> = {};
    if (body.secondsPerSub !== undefined) patch.secondsPerSub = clampInt(body.secondsPerSub, 0, 86_400, 300);
    if (body.secondsPerPln !== undefined) patch.secondsPerPln = clampInt(body.secondsPerPln, 0, 86_400, 60);
    const updated = await prisma.subathon.upsert({ where: { id: "default" }, create: { id: "default", ...patch }, update: patch });
    return NextResponse.json({ ok: true, subathon: serialize(updated) });
  }

  return NextResponse.json({ error: "action: start | stop | addTime | settings" }, { status: 400 });
}
