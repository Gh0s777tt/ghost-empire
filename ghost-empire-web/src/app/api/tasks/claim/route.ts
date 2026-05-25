// src/app/api/tasks/claim/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { today } from "@/lib/utils";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await req.json();
  if (!taskId) {
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

  // Atomic: mark claimed + add tokens
  const [updatedTask, transaction, updatedUser] = await prisma.$transaction([
    prisma.userTask.update({
      where: {
        userId_taskId_date: {
          userId: session.user.id,
          taskId,
          date: today(),
        },
      },
      data: { claimed: true, claimedAt: new Date() },
    }),
    prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "earn",
        amount: userTask.task.reward,
        reason: `daily_task:${userTask.task.code}`,
      },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: {
        tokens: { increment: userTask.task.reward },
        totalEarned: { increment: userTask.task.reward },
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    reward: userTask.task.reward,
    newBalance: updatedUser.tokens,
  });
}
