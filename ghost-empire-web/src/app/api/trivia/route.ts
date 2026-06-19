// src/app/api/trivia/route.ts
// Trivia/quiz (viewer side, #523). GET = active questions + my answers (the correct
// index is HIDDEN until you've answered, so the API can't be read to cheat). POST =
// submit an answer: one attempt per question, a correct answer awards GT atomically.
// Tenant-scoped.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

class AnswerError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const tid = await currentTenantId();

  const questions = await prisma.triviaQuestion.findMany({
    where: { active: true, ...(tid ? { tenantId: tid } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const mine = userId
    ? await prisma.triviaAnswer.findMany({
        where: { userId, questionId: { in: questions.map((q) => q.id) } },
        select: { questionId: true, optionIndex: true, correct: true },
      })
    : [];
  const byQ = new Map(mine.map((a) => [a.questionId, a]));

  const balance = userId
    ? (await prisma.user.findUnique({ where: { id: userId }, select: { tokens: true } }))?.tokens ?? 0
    : 0;

  return NextResponse.json({
    authenticated: !!userId,
    balance,
    questions: questions.map((q) => {
      const ans = byQ.get(q.id);
      return {
        id: q.id,
        question: q.question,
        options: q.options,
        reward: q.reward,
        category: q.category,
        // Only reveal the answer once the viewer has answered — never before.
        myAnswer: ans ? { optionIndex: ans.optionIndex, correct: ans.correct } : null,
        correctIndex: ans ? q.correctIndex : undefined,
      };
    }),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;

  const rl = await rateLimit(`trivia:${userId}`, 20, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  let body: { questionId?: string; optionIndex?: number };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }
  const questionId = String(body.questionId ?? "");
  const optionIndex = Math.floor(Number(body.optionIndex));
  if (!questionId || !Number.isFinite(optionIndex)) return jsonError("Brak odpowiedzi", 400);

  const tid = await currentTenantId();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const q = await tx.triviaQuestion.findFirst({ where: { id: questionId, active: true, ...(tid ? { tenantId: tid } : {}) } });
      if (!q) throw new AnswerError("Pytanie nie istnieje", 404);
      if (optionIndex < 0 || optionIndex >= q.options.length) throw new AnswerError("Nieprawidłowa opcja", 400);

      // One attempt per question — the unique guard also blocks a double-submit race.
      const already = await tx.triviaAnswer.findUnique({ where: { userId_questionId: { userId, questionId } } });
      if (already) throw new AnswerError("Już odpowiedziano", 409);

      const correct = optionIndex === q.correctIndex;
      await tx.triviaAnswer.create({ data: { userId, questionId, optionIndex, correct } });

      let newBalance: number | undefined;
      if (correct && q.reward > 0) {
        const u = await tx.user.update({
          where: { id: userId },
          data: { tokens: { increment: q.reward }, totalEarned: { increment: q.reward } },
          select: { tokens: true },
        });
        newBalance = u.tokens;
        await tx.transaction.create({ data: { userId, type: "earn", amount: q.reward, reason: "trivia_correct", status: "completed" } });
      }
      return { correct, correctIndex: q.correctIndex, reward: correct ? q.reward : 0, newBalance };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof AnswerError) return jsonError(e.message, e.status);
    return jsonError("Błąd serwera", 500);
  }
}
