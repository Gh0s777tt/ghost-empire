// src/lib/daily-tasks.ts
// Daily quest progress — shared by the Discord award endpoint and the chat-award
// endpoint so chat activity on Twitch/Kick/YouTube counts toward "messages" quests
// just like Discord does.
import { prisma } from "@/lib/prisma";
import { today } from "@/lib/utils";

export type DailyTaskTrigger = "messages" | "voice_minutes";

// The active-task catalog is effectively static at runtime (seeded; no route
// mutates DailyTask), yet this findMany ran on EVERY awarded chat/Discord message.
// Cache the id list briefly per trigger so the hot path skips it once warm.
const taskCache = new Map<DailyTaskTrigger, { at: number; ids: string[] }>();
const TASK_CACHE_MS = 5 * 60_000;

async function activeTaskIds(triggerType: DailyTaskTrigger): Promise<string[]> {
  const cached = taskCache.get(triggerType);
  const now = Date.now();
  if (cached && now - cached.at < TASK_CACHE_MS) return cached.ids;
  const rows = await prisma.dailyTask.findMany({ where: { triggerType, active: true }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  taskCache.set(triggerType, { at: now, ids });
  return ids;
}

/** Bump active daily quests of the given triggerType by 1 for today's row. */
export async function updateDailyTaskProgress(userId: string, triggerType: DailyTaskTrigger): Promise<void> {
  const ids = await activeTaskIds(triggerType);
  if (ids.length === 0) return; // no active quests of this type → skip the loop entirely
  const date = today();
  for (const taskId of ids) {
    await prisma.userTask.upsert({
      where: { userId_taskId_date: { userId, taskId, date } },
      create: { userId, taskId, date, progress: 1 },
      update: { progress: { increment: 1 } },
    });
  }
}
