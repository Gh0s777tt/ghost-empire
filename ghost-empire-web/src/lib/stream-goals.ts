// src/lib/stream-goals.ts
// Stream Goal counters + hype train state — called from event handlers
// (Twitch EventSub webhook, Streamlabs poller, YouTube poller).
import { prisma } from "@/lib/prisma";

export type GoalType =
  | "subs"
  | "gift_subs"
  | "follows"
  | "donations_pln"   // amount in PLN (integer floor)
  | "cheers_bits"
  | "yt_members";

/**
 * Bump every active goal of the given type by `amount`. Fire-and-forget — caller
 * should not let a failure here roll back the underlying transaction (sub, donation, etc.).
 *
 * Goals that hit their target are stamped with completedAt but stay visible until
 * an admin resets/deletes them — completion is celebration, not removal.
 */
export async function incrementGoals(type: GoalType, amount: number): Promise<void> {
  if (amount <= 0) return;
  try {
    const goals = await prisma.streamGoal.findMany({
      where: { type, active: true },
      select: { id: true, current: true, target: true, completedAt: true },
    });
    if (goals.length === 0) return;

    for (const g of goals) {
      const next = g.current + amount;
      const justCompleted = !g.completedAt && next >= g.target;
      await prisma.streamGoal.update({
        where: { id: g.id },
        data: {
          current: next,
          ...(justCompleted ? { completedAt: new Date() } : {}),
        },
      });
    }
  } catch (e) {
    console.error("[stream-goals] increment failed:", type, amount, e);
  }
}

// =====================================================
// Hype Train state helpers — singleton row
// =====================================================

export async function setHypeTrainStart(opts: {
  level: number;
  goal: number;
  total: number;
  expiresAt: Date;
}): Promise<void> {
  await prisma.hypeTrainState
    .upsert({
      where: { id: "default" },
      create: {
        id: "default",
        active: true,
        level: opts.level,
        goal: opts.goal,
        total: opts.total,
        startedAt: new Date(),
        expiresAt: opts.expiresAt,
        endedAt: null,
      },
      update: {
        active: true,
        level: opts.level,
        goal: opts.goal,
        total: opts.total,
        startedAt: new Date(),
        expiresAt: opts.expiresAt,
        endedAt: null,
      },
    })
    .catch((e) => console.error("[hype-train] start failed:", e));
}

export async function setHypeTrainProgress(opts: {
  level: number;
  goal: number;
  total: number;
  topContributor: string | null;
  expiresAt: Date;
}): Promise<void> {
  await prisma.hypeTrainState
    .update({
      where: { id: "default" },
      data: {
        active: true,
        level: opts.level,
        goal: opts.goal,
        total: opts.total,
        topContributor: opts.topContributor,
        expiresAt: opts.expiresAt,
      },
    })
    .catch(() => {});
}

export async function setHypeTrainEnded(): Promise<void> {
  await prisma.hypeTrainState
    .update({
      where: { id: "default" },
      data: { active: false, endedAt: new Date() },
    })
    .catch(() => {});
}
