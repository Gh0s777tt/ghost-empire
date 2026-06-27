// src/lib/backup.ts
// Builds a JSON backup of configurable content + catalog + user balances. Deliberately
// EXCLUDES secrets/PII (auth accounts, sessions, OAuth tokens, emails) and high-volume
// ephemera (chat feed, alert queue, event logs, rate limits). Shared by the admin
// download (/api/admin/backup) and the scheduled off-site cron (/api/cron/backup).
// The reads are GLOBAL (all tenants), so callers MUST gate to the platform owner.
import { prisma } from "@/lib/prisma";

export async function buildBackup(): Promise<Record<string, unknown>> {
  const [
    shopItems, events, achievements, chatCommands, chatTimers, faqResponses,
    welcomeConfig, botConfig, scheduleSlots, subathon, moderationConfig,
    seasons, seasonRewards, streamAlertSettings, alertTypeConfigs, streamCodes,
    codeDropConfig, polls, predictions, streamGoals, chatOverlayConfig,
    customAlerts, customWidgets, users,
  ] = await Promise.all([
    prisma.shopItem.findMany(),
    prisma.event.findMany(),
    prisma.achievement.findMany(),
    prisma.chatCommand.findMany(),
    prisma.chatTimer.findMany(),
    prisma.faqResponse.findMany(),
    prisma.welcomeConfig.findMany(),
    prisma.botConfig.findMany(),
    prisma.streamScheduleSlot.findMany(),
    prisma.subathon.findMany(),
    prisma.moderationConfig.findMany(),
    prisma.season.findMany(),
    prisma.seasonReward.findMany(),
    prisma.streamAlertSettings.findMany(),
    prisma.alertTypeConfig.findMany(),
    prisma.streamCode.findMany(),
    prisma.codeDropConfig.findMany(),
    prisma.poll.findMany(),
    prisma.prediction.findMany(),
    prisma.streamGoal.findMany(),
    prisma.chatOverlayConfig.findMany(),
    prisma.customAlert.findMany(),
    prisma.customWidget.findMany(),
    prisma.user.findMany({
      select: {
        id: true, username: true, displayName: true, tokens: true, totalEarned: true,
        totalSpent: true, level: true, xp: true, streak: true, isAdmin: true,
        isModerator: true, isDonator: true, createdAt: true,
      },
    }),
  ]);

  return {
    _meta: {
      app: "ghost-empire",
      exportedAt: new Date().toISOString(),
      version: 1,
      note: "Config/catalog + user balances. NO secrets/PII (no auth tokens, emails, sessions, logs).",
    },
    shopItems, events, achievements, chatCommands, chatTimers, faqResponses,
    welcomeConfig, botConfig, scheduleSlots, subathon, moderationConfig,
    seasons, seasonRewards, streamAlertSettings, alertTypeConfigs, streamCodes,
    codeDropConfig, polls, predictions, streamGoals, chatOverlayConfig,
    customAlerts, customWidgets, users,
  };
}
