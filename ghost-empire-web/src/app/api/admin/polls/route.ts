// src/app/api/admin/polls/route.ts
// Admin: list polls + create / close / reopen / delete. Admin only.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const polls = await prisma.poll.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 50,
    include: { _count: { select: { votes: true } }, votes: { select: { optionIndex: true } } },
  });

  return NextResponse.json({
    polls: polls.map((p) => ({
      id: p.id,
      question: p.question,
      options: p.options,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      closesAt: p.closesAt?.toISOString() ?? null,
      totalVotes: p._count.votes,
      counts: p.options.map((_, i) => p.votes.filter((v) => v.optionIndex === i).length),
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: string; id?: string; question?: string; options?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  switch (body.action) {
    case "create": {
      const question = String(body.question ?? "").trim().slice(0, 300);
      const options = Array.isArray(body.options)
        ? body.options.map((o) => String(o).trim()).filter(Boolean).map((o) => o.slice(0, 120)).slice(0, 10)
        : [];
      if (!question) return NextResponse.json({ error: "Pytanie wymagane" }, { status: 400 });
      if (options.length < 2) return NextResponse.json({ error: "Podaj min. 2 opcje" }, { status: 400 });
      const poll = await prisma.poll.create({ data: { question, options, createdById: auth.userId } });
      await logAdminAction({ adminId: auth.userId, action: "manage_polls", targetType: "poll", targetId: poll.id, details: { create: question }, req });
      return NextResponse.json({ ok: true, id: poll.id });
    }

    case "close":
    case "reopen": {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
      const status = body.action === "close" ? "closed" : "open";
      await prisma.poll.update({ where: { id }, data: { status } });
      await logAdminAction({ adminId: auth.userId, action: "manage_polls", targetType: "poll", targetId: id, details: { status }, req });
      return NextResponse.json({ ok: true, status });
    }

    case "delete": {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
      await prisma.poll.delete({ where: { id } }).catch(() => {}); // votes cascade
      await logAdminAction({ adminId: auth.userId, action: "manage_polls", targetType: "poll", targetId: id, details: { delete: true }, req });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "action: create | close | reopen | delete" }, { status: 400 });
  }
}
