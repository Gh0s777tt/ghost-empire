// src/lib/pruning.ts
// Housekeeping for the high-growth tables so the free-tier Postgres stays small.
// These rows are transient: the chat/alert overlays only ever show the most recent
// handful, and the event logs / notifications are only useful for a short window.
// Retention is deliberately generous; tune the day counts if you need more history.
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION_DAYS = {
  chatFeedMessages: 2,   // overlay shows only the latest ~40
  streamAlerts: 7,       // consumed by the overlay within seconds
  twitchEvents: 30,      // event log — kept for a month of debugging
  kickEvents: 30,
  notifications: 30,     // only READ notifications are pruned
  wheelSpins: 90,        // bounds the wheel history (stats stay meaningful)
} as const;

export type PruneResult = Record<keyof typeof RETENTION_DAYS, number> & { totalDeleted: number };

/** Delete rows older than their retention window. Safe to run repeatedly. */
export async function pruneOldRecords(now: number = Date.now()): Promise<PruneResult> {
  const before = (days: number) => new Date(now - days * DAY_MS);

  const [chat, alerts, twitch, kick, notifs, wheel] = await Promise.all([
    prisma.chatFeedMessage.deleteMany({ where: { createdAt: { lt: before(RETENTION_DAYS.chatFeedMessages) } } }),
    prisma.streamAlert.deleteMany({ where: { createdAt: { lt: before(RETENTION_DAYS.streamAlerts) } } }),
    prisma.twitchEvent.deleteMany({ where: { receivedAt: { lt: before(RETENTION_DAYS.twitchEvents) } } }),
    prisma.kickEvent.deleteMany({ where: { receivedAt: { lt: before(RETENTION_DAYS.kickEvents) } } }),
    prisma.notification.deleteMany({ where: { read: true, createdAt: { lt: before(RETENTION_DAYS.notifications) } } }),
    prisma.wheelSpin.deleteMany({ where: { createdAt: { lt: before(RETENTION_DAYS.wheelSpins) } } }),
  ]);

  const result = {
    chatFeedMessages: chat.count,
    streamAlerts: alerts.count,
    twitchEvents: twitch.count,
    kickEvents: kick.count,
    notifications: notifs.count,
    wheelSpins: wheel.count,
  };
  return { ...result, totalDeleted: Object.values(result).reduce((a, b) => a + b, 0) };
}
