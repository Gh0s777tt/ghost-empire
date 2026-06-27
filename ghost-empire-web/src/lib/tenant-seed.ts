// src/lib/tenant-seed.ts
// Per-tenant content seeding (#690) — extends the achievement seeding (#689) so a freshly
// onboarded portal starts with the founder's full engagement content, not an empty shell:
//   • daily quests        (DailyTask        — static catalog, clone 1:1)
//   • alert-type styling   (AlertTypeConfig  — static catalog, clone 1:1)
//   • battle pass          (Season + SeasonReward — NOT a static catalog: a fresh Season is
//                           created starting "now" with the founder's tier structure cloned in)
//
// Everything is best-effort (never throws — returns a count) and idempotent: catalog clones use
// `skipDuplicates` on their per-tenant unique; the battle pass is skipped if the tenant already
// has any season. Cloning from the DB (not hard-coded lists) keeps new portals in sync with the
// founder. NO schema change.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { seedTenantAchievements } from "@/lib/achievements";

const log = createLogger("tenant-seed");

const TEMPLATE_TENANT_SLUG = "ghost-empire";

async function templateTenantId(target: string): Promise<string | null> {
  const t = await prisma.tenant.findUnique({ where: { slug: TEMPLATE_TENANT_SLUG }, select: { id: true } });
  if (!t || t.id === target) return null; // no template, or seeding the template itself
  return t.id;
}

/** Pure: project source rows onto `{ tenantId, ...picked fields }` for a createMany payload
 *  (drops id / timestamps / source tenantId). Generic over any per-tenant catalog. Unit-tested. */
export function cloneCatalogRows<T extends Record<string, unknown>>(
  rows: T[],
  tenantId: string,
  fields: ReadonlyArray<keyof T & string>,
): Array<Record<string, unknown>> {
  return rows.map((r) => {
    const out: Record<string, unknown> = { tenantId };
    for (const f of fields) out[f] = r[f];
    return out;
  });
}

const DAILY_TASK_FIELDS = ["code", "text", "textEn", "target", "reward", "bonusReward", "triggerType", "active"] as const;
const ALERT_CONFIG_FIELDS = ["type", "animation", "position", "soundUrl", "minAmount"] as const;

/** Clone the founder's daily quests into a fresh tenant. Idempotent (skipDuplicates on
 *  [tenantId, code]), best-effort. Returns rows created. */
export async function seedTenantDailyTasks(tenantId: string): Promise<number> {
  try {
    const template = await templateTenantId(tenantId);
    if (!template) return 0;
    const source = await prisma.dailyTask.findMany({ where: { tenantId: template } });
    if (source.length === 0) return 0;
    const res = await prisma.dailyTask.createMany({
      data: cloneCatalogRows(source, tenantId, DAILY_TASK_FIELDS) as unknown as Prisma.DailyTaskCreateManyInput[],
      skipDuplicates: true,
    });
    return res.count;
  } catch (e) {
    log.error("seedTenantDailyTasks failed", e, { tenantId });
    return 0;
  }
}

/** Clone the founder's alert-type styling into a fresh tenant. Idempotent (skipDuplicates on
 *  [tenantId, type]), best-effort. Returns rows created. */
export async function seedTenantAlertConfigs(tenantId: string): Promise<number> {
  try {
    const template = await templateTenantId(tenantId);
    if (!template) return 0;
    const source = await prisma.alertTypeConfig.findMany({ where: { tenantId: template } });
    if (source.length === 0) return 0;
    const res = await prisma.alertTypeConfig.createMany({
      data: cloneCatalogRows(source, tenantId, ALERT_CONFIG_FIELDS) as unknown as Prisma.AlertTypeConfigCreateManyInput[],
      skipDuplicates: true,
    });
    return res.count;
  } catch (e) {
    log.error("seedTenantAlertConfigs failed", e, { tenantId });
    return 0;
  }
}

/** Give a fresh tenant a battle pass: create Season 1 starting now (same duration + tier
 *  structure as the founder's active season) and clone its reward tiers. Idempotent — skips if
 *  the tenant already has ANY season. Returns 1 if a season was created, else 0. */
export async function seedTenantBattlePass(tenantId: string): Promise<number> {
  try {
    const template = await templateTenantId(tenantId);
    if (!template) return 0;
    const existing = await prisma.season.findFirst({ where: { tenantId }, select: { id: true } });
    if (existing) return 0; // already has a season — don't duplicate
    const src = await prisma.season.findFirst({
      where: { tenantId: template, active: true },
      include: { rewards: true },
    });
    if (!src) return 0;
    const durationMs = Math.max(0, src.endsAt.getTime() - src.startsAt.getTime());
    const now = new Date();
    const season = await prisma.season.create({
      data: {
        tenantId,
        number: 1,
        name: "Sezon 1",
        description: src.description,
        startsAt: now,
        endsAt: new Date(now.getTime() + durationMs),
        totalTiers: src.totalTiers,
        xpPerTier: src.xpPerTier,
        active: true,
      },
      select: { id: true },
    });
    if (src.rewards.length > 0) {
      await prisma.seasonReward.createMany({
        data: src.rewards.map((r) => ({
          seasonId: season.id,
          tier: r.tier,
          premium: r.premium,
          type: r.type,
          label: r.label,
          value: r.value,
          icon: r.icon,
        })),
      });
    }
    return 1;
  } catch (e) {
    log.error("seedTenantBattlePass failed", e, { tenantId });
    return 0;
  }
}

export type TenantSeedResult = {
  achievements: number;
  dailyTasks: number;
  alertConfigs: number;
  battlePass: number; // seasons created (0 or 1)
};

/** Seed a fresh portal with the founder's engagement content (achievements + quests + alert
 *  styling + a battle pass). Best-effort across the board; safe to call right after creating a
 *  tenant and safe to re-run (everything is idempotent). */
export async function seedTenantContent(tenantId: string): Promise<TenantSeedResult> {
  const [achievements, dailyTasks, alertConfigs, battlePass] = await Promise.all([
    seedTenantAchievements(tenantId),
    seedTenantDailyTasks(tenantId),
    seedTenantAlertConfigs(tenantId),
    seedTenantBattlePass(tenantId),
  ]);
  return { achievements, dailyTasks, alertConfigs, battlePass };
}
