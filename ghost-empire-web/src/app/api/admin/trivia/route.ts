// src/app/api/admin/trivia/route.ts
// Admin CRUD for the trivia question bank (#523). Tenant-scoped. GET list (with the
// correct answer — admin only). POST create|update|delete.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
import { logAdminAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Parsed = { question: string; options: string[]; correctIndex: number; reward: number; category: string | null; active: boolean };

function parse(body: Record<string, unknown>): { ok: true; data: Parsed } | { ok: false; error: string } {
  const question = String(body.question ?? "").trim().slice(0, 500);
  const options = Array.isArray(body.options) ? body.options.map((o) => String(o).trim().slice(0, 200)).filter(Boolean) : [];
  const correctIndex = Math.floor(Number(body.correctIndex));
  const reward = Math.max(0, Math.floor(Number(body.reward ?? 100)));
  if (!question) return { ok: false, error: "Pytanie wymagane" };
  if (options.length < 2 || options.length > 6) return { ok: false, error: "2–6 opcji" };
  if (!Number.isFinite(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return { ok: false, error: "Wskaż poprawną odpowiedź" };
  return { ok: true, data: { question, options, correctIndex, reward, category: body.category ? String(body.category).trim().slice(0, 60) : null, active: body.active === undefined ? true : !!body.active } };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const questions = await prisma.triviaQuestion.findMany({
    where: tid ? { tenantId: tid } : {},
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { answers: true } } },
  });
  return NextResponse.json({
    questions: questions.map((q) => ({
      id: q.id, question: q.question, options: q.options, correctIndex: q.correctIndex,
      reward: q.reward, category: q.category, active: q.active, answers: q._count.answers,
      live: q.live, liveEndsAt: q.liveEndsAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }
  const action = String(body.action ?? "");

  if (action === "create") {
    const p = parse(body);
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
    const count = await prisma.triviaQuestion.count({ where: tid ? { tenantId: tid } : {} });
    const created = await prisma.triviaQuestion.create({ data: { ...(tid ? { tenantId: tid } : {}), ...p.data, sortOrder: count } });
    await logAdminAction({ adminId: auth.userId, action: "manage_achievements", targetType: "trivia_question", targetId: created.id, req });
    return NextResponse.json({ ok: true, id: created.id });
  }

  if (action === "update") {
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    // active-only toggle (no full re-validate needed)
    if (body.options === undefined && typeof body.active === "boolean") {
      const r = await prisma.triviaQuestion.updateMany({ where: { id, ...(tid ? { tenantId: tid } : {}) }, data: { active: body.active } });
      if (r.count === 0) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    const p = parse(body);
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
    const r = await prisma.triviaQuestion.updateMany({ where: { id, ...(tid ? { tenantId: tid } : {}) }, data: p.data });
    if (r.count === 0) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    await prisma.triviaQuestion.deleteMany({ where: { id, ...(tid ? { tenantId: tid } : {}) } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // Put ONE question live on the OBS overlay with a countdown (exclusive per tenant).
  if (action === "go-live") {
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    const durationSec = Math.min(600, Math.max(10, Math.floor(Number(body.durationSec ?? 60))));
    const owned = await prisma.triviaQuestion.findFirst({ where: { id, ...(tid ? { tenantId: tid } : {}) }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    await prisma.$transaction([
      prisma.triviaQuestion.updateMany({ where: { ...(tid ? { tenantId: tid } : {}), live: true }, data: { live: false } }),
      prisma.triviaQuestion.update({ where: { id }, data: { live: true, active: true, liveEndsAt: new Date(Date.now() + durationSec * 1000) } }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (action === "end-live") {
    await prisma.triviaQuestion.updateMany({ where: { ...(tid ? { tenantId: tid } : {}), live: true }, data: { live: false } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: create | update | delete | go-live | end-live" }, { status: 400 });
}
