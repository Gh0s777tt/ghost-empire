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
  const adminOnly = ["streamlabs", "twitch", "alerts", "audit_admin"];
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
      const items = await prisma.shopItem.findMany({
        orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      });
      return NextResponse.json({
        allShopItems: items.map((s) => ({
          id: s.id, name: s.name, description: s.description, category: s.category,
          price: s.price, imageEmoji: s.imageEmoji, stock: s.stock, totalStock: s.totalStock,
          hot: s.hot, active: s.active, featured: s.featured,
          requiresSubTier: s.requiresSubTier, requiresMinLevel: s.requiresMinLevel,
          requiresMinMonths: s.requiresMinMonths,
        })),
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

    case "audit": {
      const auditLog = await prisma.adminAction.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
      return NextResponse.json({
        auditLog: auditLog.map((a) => ({
          id: a.id, adminId: a.adminId, adminName: a.adminName, action: a.action,
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
