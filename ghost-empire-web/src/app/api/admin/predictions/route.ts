// src/app/api/admin/predictions/route.ts
// Admin CRUD + resolve/cancel for predictions.
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { resolvePrediction, cancelPrediction, MAX_OPTIONS } from "@/lib/predictions";

export async function GET() {
  const auth = await requirePermission("create_events"); // reuse — same trust level as event creators
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const all = await prisma.prediction.findMany({
    include: { _count: { select: { entries: true } } },
    orderBy: [{ status: "asc" }, { opensAt: "desc" }],
    take: 50,
  });

  // Per-prediction option breakdown
  const ids = all.map((p) => p.id);
  const entries = await prisma.predictionEntry.findMany({
    where: { predictionId: { in: ids } },
    select: { predictionId: true, optionIndex: true, tokensWagered: true },
  });
  const breakdownById = new Map<string, Array<{ index: number; total: number; count: number }>>();
  for (const p of all) {
    const opts = p.options.map((_, idx) => {
      const entriesForOpt = entries.filter((e) => e.predictionId === p.id && e.optionIndex === idx);
      return {
        index: idx,
        total: entriesForOpt.reduce((s, e) => s + e.tokensWagered, 0),
        count: entriesForOpt.length,
      };
    });
    breakdownById.set(p.id, opts);
  }

  return NextResponse.json({
    predictions: all.map((p) => ({
      id: p.id,
      question: p.question,
      options: p.options,
      status: p.status,
      resolvedOptionIndex: p.resolvedOptionIndex,
      totalPot: p.totalPot,
      opensAt: p.opensAt.toISOString(),
      closesAt: p.closesAt?.toISOString() ?? null,
      resolvedAt: p.resolvedAt?.toISOString() ?? null,
      entriesCount: p._count.entries,
      breakdown: breakdownById.get(p.id) ?? [],
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requirePermission("create_events");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    action?: string;
    id?: string;
    question?: string;
    options?: string[];
    closesAt?: string;
    winningOptionIndex?: number;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "create") {
    const question = (body.question ?? "").trim();
    if (!question || question.length < 5 || question.length > 500) {
      return NextResponse.json({ error: "Pytanie 5-500 znaków" }, { status: 400 });
    }
    const options = (body.options ?? [])
      .map((o) => String(o ?? "").trim())
      .filter((o) => o.length > 0 && o.length <= 100);
    if (options.length < 2 || options.length > MAX_OPTIONS) {
      return NextResponse.json({ error: `Opcji musi być 2-${MAX_OPTIONS}` }, { status: 400 });
    }
    let closesAt: Date | null = null;
    if (body.closesAt) {
      const d = new Date(body.closesAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Nieprawidłowy closesAt" }, { status: 400 });
      }
      if (d < new Date()) {
        return NextResponse.json({ error: "closesAt musi być w przyszłości" }, { status: 400 });
      }
      closesAt = d;
    }

    const created = await prisma.prediction.create({
      data: {
        question,
        options,
        closesAt,
        createdById: auth.userId,
      },
    });
    await logAdminAction({
      adminId: auth.userId,
      action: "create_prediction",
      targetType: "prediction",
      targetId: created.id,
      details: { question, optionsCount: options.length, closesAt: closesAt?.toISOString() ?? null },
      req,
    });
    return NextResponse.json({ ok: true, prediction: created });
  }

  if (body.action === "lock") {
    if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    const updated = await prisma.prediction.update({
      where: { id: body.id },
      data: { status: "locked" },
    });
    return NextResponse.json({ ok: true, prediction: updated });
  }

  if (body.action === "resolve") {
    if (!body.id || typeof body.winningOptionIndex !== "number") {
      return NextResponse.json({ error: "id + winningOptionIndex wymagane" }, { status: 400 });
    }
    const result = await resolvePrediction({
      predictionId: body.id,
      winningOptionIndex: body.winningOptionIndex,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await logAdminAction({
      adminId: auth.userId,
      action: "resolve_prediction",
      targetType: "prediction",
      targetId: body.id,
      details: {
        winningOptionIndex: body.winningOptionIndex,
        winnersCount: result.winnersCount,
        losersCount: result.losersCount,
        potDistributed: result.potDistributed,
        refunded: result.refunded,
      },
      req,
    });
    return NextResponse.json(result);
  }

  if (body.action === "cancel") {
    if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    const result = await cancelPrediction(body.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await logAdminAction({
      adminId: auth.userId,
      action: "cancel_prediction",
      targetType: "prediction",
      targetId: body.id,
      details: { refunded: result.refunded },
      req,
    });
    return NextResponse.json(result);
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    const prediction = await prisma.prediction.findUnique({ where: { id: body.id } });
    if (!prediction) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    if (prediction.status !== "cancelled" && prediction.status !== "resolved") {
      return NextResponse.json({ error: "Najpierw anuluj/rozstrzygnij" }, { status: 409 });
    }
    await prisma.prediction.delete({ where: { id: body.id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: create | lock | resolve | cancel | delete" }, { status: 400 });
}
