// src/app/api/polls/vote/route.ts
// Logged-in user casts (or changes) their vote in an open poll. One vote per user.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  let body: { pollId?: string; optionIndex?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const pollId = String(body.pollId ?? "");
  const optionIndex = Math.floor(Number(body.optionIndex));
  if (!pollId || !Number.isFinite(optionIndex)) {
    return NextResponse.json({ error: "Brak pollId / optionIndex" }, { status: 400 });
  }

  const userId = session.user.id;
  const rl = await rateLimit(`poll:vote:${userId}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za szybko. Spróbuj za chwilę." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const poll = await prisma.poll.findUnique({ where: { id: pollId } });
  if (!poll) return NextResponse.json({ error: "Ankieta nie istnieje" }, { status: 404 });
  if (poll.status !== "open") return NextResponse.json({ error: "Ankieta jest zamknięta" }, { status: 409 });
  if (optionIndex < 0 || optionIndex >= poll.options.length) {
    return NextResponse.json({ error: "Nieprawidłowa opcja" }, { status: 400 });
  }

  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId, userId } },
    create: { pollId, userId, optionIndex },
    update: { optionIndex },
  });

  const votes = await prisma.pollVote.findMany({ where: { pollId }, select: { optionIndex: true } });
  const counts = poll.options.map((_, i) => votes.filter((v) => v.optionIndex === i).length);
  return NextResponse.json({ ok: true, counts, total: votes.length, yourVote: optionIndex });
}
