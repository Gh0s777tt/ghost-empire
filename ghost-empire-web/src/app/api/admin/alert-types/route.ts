// src/app/api/admin/alert-types/route.ts
// Admin: read / save per-alert-type overlay overrides (animation / position /
// custom sound / amount threshold). Applied live by /overlay via the queue.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import {
  ALERT_TYPE_LIST,
  ALERT_ANIMATIONS,
  ALERT_POSITIONS,
  DEFAULT_ALERT_TYPE_CFG,
  type AlertAnimation,
  type AlertPosition,
} from "@/lib/alert-types";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rows = await prisma.alertTypeConfig.findMany();
  const byType = new Map(rows.map((r) => [r.type, r]));

  const types = ALERT_TYPE_LIST.map(({ type, label }) => {
    const r = byType.get(type);
    return {
      type,
      label,
      animation: (r?.animation as AlertAnimation) ?? DEFAULT_ALERT_TYPE_CFG.animation,
      position: (r?.position as AlertPosition) ?? DEFAULT_ALERT_TYPE_CFG.position,
      soundUrl: r?.soundUrl ?? null,
      minAmount: r?.minAmount ?? null,
      configured: !!r,
    };
  });

  return NextResponse.json({ types });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type : "";
  if (!ALERT_TYPE_LIST.some((t) => t.type === type)) {
    return NextResponse.json({ error: "Nieznany typ alertu" }, { status: 400 });
  }

  const animRaw = typeof body.animation === "string" ? body.animation : "";
  const animation = (ALERT_ANIMATIONS as readonly string[]).includes(animRaw)
    ? (animRaw as AlertAnimation)
    : DEFAULT_ALERT_TYPE_CFG.animation;

  const posRaw = typeof body.position === "string" ? body.position : "";
  const position = (ALERT_POSITIONS as readonly string[]).includes(posRaw)
    ? (posRaw as AlertPosition)
    : DEFAULT_ALERT_TYPE_CFG.position;

  const soundUrl =
    typeof body.soundUrl === "string" && body.soundUrl.trim()
      ? body.soundUrl.trim().slice(0, 500)
      : null;

  let minAmount: number | null = null;
  if (body.minAmount !== undefined && body.minAmount !== null && body.minAmount !== "") {
    const n = Math.floor(Number(body.minAmount));
    minAmount = Number.isFinite(n) && n > 0 ? n : null;
  }

  const data = { animation, position, soundUrl, minAmount };
  const saved = await prisma.alertTypeConfig.upsert({
    where: { type },
    create: { type, ...data },
    update: data,
  });

  return NextResponse.json({
    ok: true,
    config: {
      type: saved.type,
      animation: saved.animation,
      position: saved.position,
      soundUrl: saved.soundUrl,
      minAmount: saved.minAmount,
      configured: true,
    },
  });
}
