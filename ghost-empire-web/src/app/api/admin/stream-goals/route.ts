// src/app/api/admin/stream-goals/route.ts
// CRUD for Stream Goals + Hype Train state read. Admin-only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";

const VALID_TYPES = ["subs", "gift_subs", "follows", "donations_pln", "cheers_bits", "yt_members"] as const;
const VALID_RESET_MODES = ["manual", "per_stream", "daily", "weekly", "monthly"] as const;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [goals, hypeTrain] = await Promise.all([
    prisma.streamGoal.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }] }),
    prisma.hypeTrainState.findUnique({ where: { id: "default" } }),
  ]);

  return NextResponse.json({
    goals: goals.map((g) => ({
      ...g,
      lastResetAt: g.lastResetAt?.toISOString() ?? null,
      completedAt: g.completedAt?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })),
    hypeTrain: hypeTrain
      ? {
          ...hypeTrain,
          startedAt: hypeTrain.startedAt?.toISOString() ?? null,
          expiresAt: hypeTrain.expiresAt?.toISOString() ?? null,
          endedAt: hypeTrain.endedAt?.toISOString() ?? null,
          updatedAt: hypeTrain.updatedAt.toISOString(),
        }
      : null,
    validTypes: VALID_TYPES,
    validResetModes: VALID_RESET_MODES,
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    action?: string;
    id?: string;
    type?: string;
    label?: string;
    target?: number;
    current?: number;
    active?: boolean;
    resetMode?: string;
    color?: string;
    sortOrder?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "create") {
    if (!body.type || !(VALID_TYPES as readonly string[]).includes(body.type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (!body.label || body.label.length > 200) {
      return NextResponse.json({ error: "Label 1-200 znaków" }, { status: 400 });
    }
    if (!body.target || body.target < 1) {
      return NextResponse.json({ error: "Target musi być > 0" }, { status: 400 });
    }
    const resetMode = body.resetMode && (VALID_RESET_MODES as readonly string[]).includes(body.resetMode)
      ? body.resetMode
      : "manual";
    const color = body.color && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : null;

    const created = await prisma.streamGoal.create({
      data: {
        type: body.type,
        label: body.label.trim(),
        target: Math.floor(body.target),
        resetMode,
        color,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "stream_goal_create",
      targetId: created.id,
      details: { type: created.type, target: created.target, label: created.label },
      req,
    });
    return NextResponse.json({ ok: true, goal: created });
  }

  if (body.action === "update") {
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (typeof body.label === "string") patch.label = body.label.slice(0, 200);
    if (typeof body.target === "number" && body.target > 0) patch.target = Math.floor(body.target);
    if (typeof body.current === "number" && body.current >= 0) patch.current = Math.floor(body.current);
    if (typeof body.active === "boolean") patch.active = body.active;
    if (body.resetMode && (VALID_RESET_MODES as readonly string[]).includes(body.resetMode)) patch.resetMode = body.resetMode;
    if (body.color === null) patch.color = null;
    else if (body.color && /^#[0-9a-fA-F]{6}$/.test(body.color)) patch.color = body.color;
    if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;

    const updated = await prisma.streamGoal.update({ where: { id: body.id }, data: patch });
    return NextResponse.json({ ok: true, goal: updated });
  }

  if (body.action === "reset") {
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const updated = await prisma.streamGoal.update({
      where: { id: body.id },
      data: { current: 0, completedAt: null, lastResetAt: new Date() },
    });
    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "stream_goal_reset",
      targetId: body.id,
      req,
    });
    return NextResponse.json({ ok: true, goal: updated });
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await prisma.streamGoal.delete({ where: { id: body.id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: create | update | reset | delete" }, { status: 400 });
}
