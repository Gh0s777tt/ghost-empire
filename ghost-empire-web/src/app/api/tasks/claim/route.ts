// src/app/api/tasks/claim/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { today } from "@/lib/utils";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

/** Thrown inside the claim transaction when a concurrent request already claimed the
 *  task, so the transaction rolls back instead of crediting tokens twice. */
class AlreadyClaimedError extends Error {}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`tasks:claim:${session.user.id}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele żądań. Spróbuj ponownie za chwilę." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: { taskId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }
  const taskId = body.taskId;
  if (typeof taskId !== "string" || !taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  // Find the UserTask for today
  const userTask = await prisma.userTask.findUnique({
    where: {
      userId_taskId_date: {
        userId: session.user.id,
        taskId,
        date: today(),
      },
    },
    include: { task: true },
  });

  if (!userTask) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (userTask.claimed) {
    return NextResponse.json({ error: "Already claimed" }, { status: 409 });
  }

  if (userTask.progress < userTask.task.target) {
    return NextResponse.json({ error: "Task not completed" }, { status: 400 });
  }

  // Atomic claim. The pre-check above is a fast path for UX; the real guard against a
  // concurrent double-claim is the conditional updateMany below. Under READ COMMITTED
  // two parallel requests can both pass the pre-check, and because this is an UPDATE of
  // an existing row (no INSERT) the @@unique(userId,taskId,date) can't catch the race.
  // Gating the UPDATE on `claimed: false` makes exactly one request win (count === 1).
  let newBalance: number;
  try {
    newBalance = await prisma.$transaction(async (tx) => {
      const claim = await tx.userTask.updateMany({
        where: {
          userId: session.user.id,
          taskId,
          date: today(),
          claimed: false,
        },
        data: { claimed: true, claimedAt: new Date() },
      });
      if (claim.count === 0) {
        // Lost the race (another in-flight request claimed it first) — abort + roll back.
        throw new AlreadyClaimedError();
      }
      await tx.transaction.create({
        data: {
          userId: session.user.id,
          type: "earn",
          amount: userTask.task.reward,
          reason: `daily_task:${userTask.task.code}`,
        },
      });
      const updatedUser = await tx.user.update({
        where: { id: session.user.id },
        data: {
          tokens: { increment: userTask.task.reward },
          totalEarned: { increment: userTask.task.reward },
        },
      });
      return updatedUser.tokens;
    });
  } catch (e) {
    if (e instanceof AlreadyClaimedError) {
      return NextResponse.json({ error: "Already claimed" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({
    ok: true,
    reward: userTask.task.reward,
    newBalance,
  });
}
