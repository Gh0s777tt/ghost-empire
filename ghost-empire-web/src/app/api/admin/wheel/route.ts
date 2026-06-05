// src/app/api/admin/wheel/route.ts
// Admin-only: configure the Wheel of Fortune (enable, cost per spin, segments)
// and view recent spins.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { getWheelConfig, parseSegments } from "@/lib/wheel";
import { displayNick } from "@/lib/utils";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const cfg = await getWheelConfig();
  const recent = await prisma.wheelSpin.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { username: true, displayName: true } } },
  });
  const totals = await prisma.wheelSpin.aggregate({
    _count: { _all: true },
    _sum: { cost: true, rewardTokens: true },
  });

  return NextResponse.json({
    enabled: cfg.enabled,
    costPerSpin: cfg.costPerSpin,
    segments: cfg.segments, // full segments incl. weight (admin needs them)
    stats: {
      spins: totals._count._all,
      spent: totals._sum.cost ?? 0,
      paidOut: totals._sum.rewardTokens ?? 0,
    },
    recent: recent.map((r) => ({
      id: r.id,
      name: displayNick(r.user.displayName, r.user.username),
      label: r.segmentLabel,
      reward: r.rewardTokens,
      cost: r.cost,
      at: r.createdAt.toISOString(),
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

  const data: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.costPerSpin === "number" && Number.isFinite(body.costPerSpin)) {
    data.costPerSpin = Math.max(0, Math.min(1_000_000, Math.floor(body.costPerSpin)));
  }
  if (body.segments !== undefined) {
    // Validate/normalise via the same parser the runtime uses, then store as JSON.
    data.segments = parseSegments(body.segments);
  }

  await prisma.wheelConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });

  await logAdminAction({ adminId: auth.userId, action: "update_wheel", targetType: "wheel", targetId: "default", req });

  return NextResponse.json({ ok: true, ...(await getWheelConfig()) });
}
