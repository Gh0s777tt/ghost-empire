// src/lib/happy-hour.ts
// Happy hours: a GT-earn multiplier active inside a configured clock window
// (Europe/Warsaw — the streamer's timezone). Applied PORTAL-SIDE in the award
// routes, so the chat/Discord bots need no changes. Config lives on BotConfig
// and is cached 60 s (shared via Redis when available).
import { prisma } from "@/lib/prisma";
import { cacheJson } from "@/lib/redis";

export type HappyHourConfig = { enabled: boolean; startHour: number; endHour: number; multiplier: number };

export async function getHappyHourConfig(): Promise<HappyHourConfig> {
  return cacheJson("happy-hour:config", 60_000, async () => {
    const cfg = await prisma.botConfig.findFirst({
      select: { happyHourEnabled: true, happyHourStart: true, happyHourEnd: true, happyHourMultiplier: true },
    });
    return {
      enabled: cfg?.happyHourEnabled ?? false,
      startHour: cfg?.happyHourStart ?? 19,
      endHour: cfg?.happyHourEnd ?? 22,
      multiplier: cfg?.happyHourMultiplier ?? 2,
    };
  });
}

/** Current hour (0-23) in Europe/Warsaw, DST-correct. */
export function warsawHour(now: Date = new Date()): number {
  return parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "numeric", hour12: false }).format(now), 10) % 24;
}

/** Pure window check ([start, end) — start > end means an overnight window). */
export function isHappyHourActive(cfg: HappyHourConfig, now: Date = new Date()): boolean {
  if (!cfg.enabled || cfg.multiplier <= 1) return false;
  const h = warsawHour(now);
  return cfg.startHour <= cfg.endHour
    ? h >= cfg.startHour && h < cfg.endHour
    : h >= cfg.startHour || h < cfg.endHour;
}

/** The multiplier to apply right now (1 outside the window / when disabled). */
export async function happyHourBoost(): Promise<number> {
  const cfg = await getHappyHourConfig();
  return isHappyHourActive(cfg) ? cfg.multiplier : 1;
}
