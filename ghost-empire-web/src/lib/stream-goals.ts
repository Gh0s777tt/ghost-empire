// src/lib/stream-goals.ts
// Stream Goal counters + hype train state — called from event handlers
// (Twitch EventSub webhook, Streamlabs poller, YouTube poller).
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

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
 *
 * `tenantId`: webhook/poller handlers pass the tenant mapped from the event's
 * broadcaster (or connection row) so one tenant's sub never bumps another tenant's
 * goals; omitted → resolve from the request Host. Legacy NULL-tenant rows are
 * included alongside (pre-backfill safety).
 */
export async function incrementGoals(type: GoalType, amount: number, tenantId?: string | null): Promise<void> {
  if (amount <= 0) return;
  try {
    const tid = tenantId === undefined ? await currentTenantId() : tenantId;
    const goals = await prisma.streamGoal.findMany({
      where: { type, active: true, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
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
}, tenantId?: string | null): Promise<void> {
  const tid = tenantId === undefined ? await currentTenantId() : tenantId;
  const data = {
    active: true,
    level: opts.level,
    goal: opts.goal,
    total: opts.total,
    startedAt: new Date(),
    expiresAt: opts.expiresAt,
    endedAt: null,
  };
  await (tid
    ? prisma.hypeTrainState.upsert({
        where: { tenantId: tid },
        create: { tenantId: tid, ...data },
        update: data,
      })
    : prisma.hypeTrainState.upsert({
        where: { id: "default" },
        create: { id: "default", ...data },
        update: data,
      })
  ).catch((e) => console.error("[hype-train] start failed:", e));
}

export async function setHypeTrainProgress(opts: {
  level: number;
  goal: number;
  total: number;
  topContributor: string | null;
  expiresAt: Date;
}, tenantId?: string | null): Promise<void> {
  const tid = tenantId === undefined ? await currentTenantId() : tenantId;
  const data = {
    active: true,
    level: opts.level,
    goal: opts.goal,
    total: opts.total,
    topContributor: opts.topContributor,
    expiresAt: opts.expiresAt,
  };
  await (tid
    ? prisma.hypeTrainState.upsert({
        where: { tenantId: tid },
        create: { tenantId: tid, ...data },
        update: data,
      })
    : prisma.hypeTrainState.update({ where: { id: "default" }, data })
  ).catch(() => {});
}

export async function setHypeTrainEnded(tenantId?: string | null): Promise<void> {
  const tid = tenantId === undefined ? await currentTenantId() : tenantId;
  const data = { active: false, endedAt: new Date() };
  await (tid
    ? prisma.hypeTrainState.upsert({
        where: { tenantId: tid },
        create: { tenantId: tid, ...data },
        update: data,
      })
    : prisma.hypeTrainState.update({ where: { id: "default" }, data })
  ).catch(() => {});
}
