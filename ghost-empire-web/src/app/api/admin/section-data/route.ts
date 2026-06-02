// src/app/api/admin/section-data/route.ts
// Lazy data source for admin sections — each admin section fetches ONLY its own
// data on open (via ?s=<section>), instead of the /admin page fetching all ~18
// queries up-front on every load. Dashboard data stays server-rendered in page.tsx.
//
// Returns the exact shapes the section manager components expect (mappings moved
// here verbatim from the old admin/page.tsx server fetch).
import { NextResponse } from "next/server";
import { requireAdmin, requirePermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getSettings as getAlertSettings } from "@/lib/alerts";
import { getCodeConfig } from "@/lib/codes";
import { displayNick } from "@/lib/utils";
import type { ModPermission } from "@/lib/permissions";

const ALL_ALERT_TYPES = [
  "shop_purchase", "event_win", "drop_claim_bonus",
  "twitch_sub", "twitch_gift_sub", "twitch_cheer",
  "donation", "welcome", "level_up", "test",
];

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const section = new URL(req.url).searchParams.get("s");

  // Per-section permission gate (mirrors the UI sidebar gating).
  const adminOnly = ["streamlabs", "twitch", "alerts", "audit_admin", "codes"];
  const permMap: Record<string, ModPermission> = {
    shop: "manage_shop",
    events: "edit_events",
    schedule: "manage_shop",
    bot: "manage_shop",
    audit: "view_audit",
  };

  if (adminOnly.includes(section ?? "")) {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  } else if (permMap[section ?? ""]) {
    const auth = await requirePermission(permMap[section!]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  } else {
    return NextResponse.json({ error: "Nieznana sekcja" }, { status: 400 });
  }

  switch (section) {
    case "shop": {
      const [items, achievements] = await Promise.all([
        prisma.shopItem.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
        prisma.achievement.findMany({ select: { code: true, name: true }, orderBy: { name: "asc" } }),
      ]);
      return NextResponse.json({
        allShopItems: items.map((s) => ({
          id: s.id, name: s.name, description: s.description, category: s.category,
          price: s.price, imageEmoji: s.imageEmoji, imageUrl: s.imageUrl, stock: s.stock, totalStock: s.totalStock,
          hot: s.hot, active: s.active, featured: s.featured,
          requiresSubTier: s.requiresSubTier, requiresMinLevel: s.requiresMinLevel,
          requiresMinMonths: s.requiresMinMonths, requiresAchievement: s.requiresAchievement,
        })),
        achievements: achievements.map((a) => ({ code: a.code, name: a.name })),
      });
    }

    case "events": {
      const events = await prisma.event.findMany({
        where: { active: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return NextResponse.json({
        allEvents: events.map((e) => ({
          id: e.id, type: e.type, name: e.name, description: e.description,
          multiplier: e.multiplier, prize: e.prize, winnersCount: e.winnersCount,
          requirement: e.requirement, ticketPrice: e.ticketPrice, maxTicketsPerUser: e.maxTicketsPerUser,
          startsAt: e.startsAt?.toISOString() ?? null, endsAt: e.endsAt?.toISOString() ?? null,
          drawnAt: e.drawnAt?.toISOString() ?? null, active: e.active,
        })),
      });
    }

    case "schedule": {
      const slots = await prisma.streamScheduleSlot.findMany({
        orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }, { startMinute: "asc" }],
      });
      return NextResponse.json({
        scheduleSlots: slots.map((s) => ({
          id: s.id, dayOfWeek: s.dayOfWeek, startHour: s.startHour, startMinute: s.startMinute,
          durationMinutes: s.durationMinutes, title: s.title, platform: s.platform, active: s.active,
        })),
      });
    }

    case "bot": {
      const botConfig = await prisma.botConfig.upsert({
        where: { id: "default" }, create: { id: "default" }, update: {},
      });
      return NextResponse.json({ botConfig });
    }

    case "codes": {
      const [codes, codeConfig, alertSettings] = await Promise.all([
        prisma.streamCode.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
        getCodeConfig(),
        getAlertSettings(),
      ]);
      return NextResponse.json({
        codes: codes.map((c) => ({
          id: c.id, code: c.code, label: c.label, active: c.active,
          shownCount: c.shownCount, lastShownAt: c.lastShownAt?.toISOString() ?? null,
        })),
        codeConfig: {
          enabled: codeConfig.enabled, intervalSeconds: codeConfig.intervalSeconds,
          title: codeConfig.title, accentColor: codeConfig.accentColor,
        },
        overlayToken: alertSettings.overlayToken,
      });
    }

    case "audit": {
      const auditLog = await prisma.adminAction.findMany({ orderBy: { createdAt: "desc" }, take: 30 });

      // Resolve human-readable names so the log shows WHO did it + WHO it affected,
      // not raw cuids. Admin + user-targets come from User; connection-targets join
      // through Connection -> User. Older/other entries fall back to details.
      const userIds = new Set<string>();
      const connIds: string[] = [];
      for (const a of auditLog) {
        userIds.add(a.adminId);
        if (a.targetId && a.targetType === "user") userIds.add(a.targetId);
        if (a.targetId && a.targetType === "connection") connIds.push(a.targetId);
      }
      const [auditUsers, auditConns] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, username: true, displayName: true },
        }),
        connIds.length
          ? prisma.connection.findMany({
              where: { id: { in: connIds } },
              select: { id: true, platform: true, user: { select: { username: true, displayName: true } } },
            })
          : Promise.resolve([] as Array<{ id: string; platform: string; user: { username: string | null; displayName: string | null } }>),
      ]);
      // displayNick → never a leaked full name (value with a space); shows the nick.
      const nameById = new Map(auditUsers.map((u) => [u.id, displayNick(u.displayName, u.username)]));
      const connById = new Map(
        auditConns.map((c) => [c.id, `${displayNick(c.user.displayName, c.user.username)} · ${c.platform}`]),
      );
      const targetNameFor = (a: { targetType: string | null; targetId: string | null; details: string | null }): string | null => {
        if (a.targetType === "user" && a.targetId) return nameById.get(a.targetId) ?? null;
        if (a.targetType === "connection" && a.targetId) return connById.get(a.targetId) ?? null;
        if (a.details) {
          try {
            const d = JSON.parse(a.details) as Record<string, unknown>;
            return (d.targetUsername as string) ?? (d.username as string) ?? null;
          } catch { /* not JSON */ }
        }
        return null;
      };

      return NextResponse.json({
        auditLog: auditLog.map((a) => ({
          id: a.id, adminId: a.adminId,
          adminName: nameById.get(a.adminId) ?? a.adminName,
          targetName: targetNameFor(a),
          action: a.action,
          targetType: a.targetType, targetId: a.targetId, details: a.details,
          ipAddress: a.ipAddress, createdAt: a.createdAt.toISOString(),
        })),
      });
    }

    case "streamlabs": {
      const [conn, unmatched] = await Promise.all([
        prisma.streamlabsConnection.findUnique({ where: { id: "default" } }),
        prisma.donation.findMany({
          where: { userId: null, matchType: null },
          orderBy: { donatedAt: "desc" },
          take: 30,
        }),
      ]);
      return NextResponse.json({
        streamlabsConnection: conn ? {
          connected: true,
          streamlabsUsername: conn.streamlabsUsername,
          connectedAt: conn.connectedAt.toISOString(),
          lastPolledAt: conn.lastPolledAt?.toISOString() ?? null,
          lastSeenDonationId: conn.lastSeenDonationId,
        } : { connected: false },
        unmatchedDonations: unmatched.map((d) => ({
          id: d.id, externalId: d.externalId, donorName: d.donorName, message: d.message,
          amountGrosze: d.amountGrosze, currency: d.currency, donatedAt: d.donatedAt.toISOString(),
        })),
      });
    }

    case "twitch": {
      const [streamer, subs, recent] = await Promise.all([
        prisma.twitchStreamerToken.findUnique({ where: { id: "default" } }),
        prisma.twitchEventSubscription.findMany({ orderBy: { type: "asc" } }),
        prisma.twitchEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 10 }),
      ]);
      return NextResponse.json({
        twitchEventSub: {
          streamerConnected: !!streamer,
          broadcasterLogin: streamer?.broadcasterLogin ?? null,
          broadcasterId: streamer?.broadcasterId ?? null,
          connectedAt: streamer?.connectedAt.toISOString() ?? null,
          subscriptions: subs.map((s) => ({
            id: s.id, type: s.type, status: s.status,
            lastSeenAt: s.lastSeenAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString(),
          })),
          recentEvents: recent.map((e) => ({
            id: e.id, type: e.type, userId: e.userId,
            tokensGranted: e.tokensGranted, receivedAt: e.receivedAt.toISOString(),
          })),
        },
      });
    }

    case "alerts": {
      const [settings, recentAlerts] = await Promise.all([
        getAlertSettings(),
        prisma.streamAlert.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      ]);
      return NextResponse.json({
        streamAlerts: {
          overlayToken: settings.overlayToken,
          settings: {
            enabledTypes: settings.enabledTypes,
            durationMs: settings.durationMs,
            accentColor: settings.accentColor,
            soundEnabled: settings.soundEnabled,
            sizeScale: settings.sizeScale,
            textScale: settings.textScale,
            textColor: settings.textColor,
          },
          allTypes: ALL_ALERT_TYPES,
          recent: recentAlerts.map((a) => ({
            id: a.id, type: a.type, title: a.title, message: a.message, icon: a.icon,
            actorName: a.actorName, amount: a.amount, amountLabel: a.amountLabel,
            createdAt: a.createdAt.toISOString(), shownAt: a.shownAt?.toISOString() ?? null,
          })),
        },
      });
    }

    default:
      return NextResponse.json({ error: "Nieznana sekcja" }, { status: 400 });
  }
}
