// src/app/api/admin/backup/route.ts
// Admin-only: download a JSON backup of the configurable content + catalog + user
// balances. Deliberately EXCLUDES secrets/PII (auth accounts, sessions, OAuth tokens,
// emails) and high-volume ephemera (chat feed, alert queue, event logs, rate limits).
import { NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  // SECURITY: the reads below are global (empty `where`) and include every user's GT
  // balance + role flags across ALL tenants. Gate to the platform owner, not a
  // per-tenant admin. (A per-portal backup would need tenant-scoped reads.) #audit-H1.
  const auth = await requirePlatformOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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

  const data = {
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

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ghost-empire-backup-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
