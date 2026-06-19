// src/app/api/polls/vote/route.ts
// Logged-in user casts (or changes) their vote in an open poll. One vote per user.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { updateDailyTaskProgress } from "@/lib/daily-tasks";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return jsonError("Musisz być zalogowany", 401);
  }

  let body: { pollId?: string; optionIndex?: number };
  try { body = await req.json(); } catch {
    return jsonError("Nieprawidłowe dane", 400);
  }

  const pollId = String(body.pollId ?? "");
  const optionIndex = Math.floor(Number(body.optionIndex));
  if (!pollId || !Number.isFinite(optionIndex)) {
    return jsonError("Brak pollId / optionIndex", 400);
  }

  const userId = session.user.id;
  const rl = await rateLimit(`poll:vote:${userId}`, 30, 60_000);
  if (!rl.allowed) {
    return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));
  }

  const tid = await currentTenantId();
  const poll = await prisma.poll.findFirst({ where: { id: pollId, ...(tid ? { tenantId: tid } : {}) } });
  if (!poll) return jsonError("Ankieta nie istnieje", 404);
  if (poll.status !== "open") return jsonError("Ankieta jest zamknięta", 409);
  if (optionIndex < 0 || optionIndex >= poll.options.length) {
    return jsonError("Nieprawidłowa opcja", 400);
  }

  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId, userId } },
    create: { pollId, userId, optionIndex },
    update: { optionIndex },
  });
  await updateDailyTaskProgress(userId, "poll_vote").catch(() => {}); // best-effort daily quest

  const votes = await prisma.pollVote.findMany({ where: { pollId }, select: { optionIndex: true } });
  const counts = poll.options.map((_, i) => votes.filter((v) => v.optionIndex === i).length);
  return NextResponse.json({ ok: true, counts, total: votes.length, yourVote: optionIndex });
}
