// src/lib/daily-tasks.ts
// Daily quest progress — shared by the Discord award endpoint and the chat-award
// endpoint so chat activity on Twitch/Kick/YouTube counts toward "messages" quests
// just like Discord does.
import { prisma } from "@/lib/prisma";
import { today } from "@/lib/utils";

// Quest trigger catalog. "messages"/"voice_minutes" come from chat/voice activity;
// the rest are fired (best-effort) by their respective on-site actions so daily
// quests can reward the whole engagement loop. "drop_code" is handled inline in
// drops/claim (inside its transaction) and isn't routed through here.
export type DailyTaskTrigger =
  | "messages"
  | "voice_minutes"
  | "clan_contribute"
  | "companion_feed"
  | "wheel_spin"
  | "poll_vote";

// The active-task catalog is effectively static at runtime (seeded; no route
// mutates DailyTask), yet this findMany ran on EVERY awarded chat/Discord message.
// Cache the id list briefly per (tenant, trigger) so the hot path skips it once warm.
// Per-tenant (#512): each portal has its own quests, so the cache key + query are
// scoped by the awarded user's tenant.
const taskCache = new Map<string, { at: number; ids: string[] }>();
const TASK_CACHE_MS = 5 * 60_000;

async function activeTaskIds(tenantId: string | null, triggerType: DailyTaskTrigger): Promise<string[]> {
  const key = `${tenantId ?? "*"}|${triggerType}`;
  const cached = taskCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < TASK_CACHE_MS) return cached.ids;
  const rows = await prisma.dailyTask.findMany({
    where: { triggerType, active: true, ...(tenantId ? { tenantId } : {}) },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  taskCache.set(key, { at: now, ids });
  return ids;
}

/** Bump active daily quests of the given triggerType by 1 for today's row. */
export async function updateDailyTaskProgress(userId: string, triggerType: DailyTaskTrigger): Promise<void> {
  // Scope to the user's portal (like achievements) — award context may have no tenant Host.
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  const ids = await activeTaskIds(u?.tenantId ?? null, triggerType);
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
