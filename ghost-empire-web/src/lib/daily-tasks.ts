// src/lib/daily-tasks.ts
// Daily quest progress — shared by the Discord award endpoint and the chat-award
// endpoint so chat activity on Twitch/Kick/YouTube counts toward "messages" quests
// just like Discord does.
import { prisma } from "@/lib/prisma";
import { today } from "@/lib/utils";

export type DailyTaskTrigger = "messages" | "voice_minutes";

/** Bump active daily quests of the given triggerType by 1 for today's row. */
export async function updateDailyTaskProgress(userId: string, triggerType: DailyTaskTrigger): Promise<void> {
  const tasks = await prisma.dailyTask.findMany({ where: { triggerType, active: true } });
  for (const task of tasks) {
    await prisma.userTask.upsert({
      where: { userId_taskId_date: { userId, taskId: task.id, date: today() } },
      create: { userId, taskId: task.id, date: today(), progress: 1 },
      update: { progress: { increment: 1 } },
    });
  }
}
