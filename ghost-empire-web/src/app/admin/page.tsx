// src/app/admin/page.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { AdminClient } from "@/components/admin/AdminClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin", description: "Panel administracyjny Ghost Empire" };

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/admin");
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, isModerator: true, modPermissions: true, isBanned: true },
  });

  // Allow admins + moderators (any permissions). Block everyone else.
  if (!me || me.isBanned || (!me.isAdmin && !me.isModerator)) {
    redirect("/?denied=admin");
  }

  // Admin has implicit all permissions; mod has whatever's in their array.
  const myPermissions: string[] = me.isAdmin
    ? ["__all__"]   // sentinel — AdminClient treats this as "all"
    : me.modPermissions;

  const [stats, activeDrops, activeEvents, pendingOrders] = await Promise.all([
    Promise.all([
      prisma.user.count(),
      prisma.user.aggregate({ _sum: { tokens: true, totalEarned: true } }),
      prisma.event.count({ where: { active: true } }),
      prisma.transaction.count({ where: { type: "spend", status: "pending" } }),
    ]),
    prisma.streamDrop.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { claims: true } } },
    }),
    prisma.event.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        _count: { select: { entries: true, raffleTickets: true } },
      },
    }),
    prisma.transaction.findMany({
      where: { type: "spend", status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        shopItem: { select: { name: true, imageEmoji: true, category: true } },
        user: { select: { username: true, displayName: true, discordId: true, discordUsername: true } },
      },
    }),
  ]);

  // Audit log — last 30 admin actions
  const auditLog = await prisma.adminAction.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  // All shop items (including inactive — admin needs to see/reactivate)
  const allShopItems = await prisma.shopItem.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  // Bot config (singleton, lazy-create)
  const botConfig = await prisma.botConfig.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });

  // Schedule slots
  const scheduleSlots = await prisma.streamScheduleSlot.findMany({
    orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }, { startMinute: "asc" }],
  });

  // Streamlabs connection + recent unmatched donations
  const streamlabsConn = await prisma.streamlabsConnection.findUnique({ where: { id: "default" } });
  const unmatchedDonations = await prisma.donation.findMany({
    where: { userId: null, matchType: null },
    orderBy: { donatedAt: "desc" },
    take: 30,
  });

  // Twitch EventSub state
  const twitchStreamer = await prisma.twitchStreamerToken.findUnique({ where: { id: "default" } });
  const twitchSubs = await prisma.twitchEventSubscription.findMany({
    orderBy: { type: "asc" },
  });
  const recentTwitchEvents = await prisma.twitchEvent.findMany({
    orderBy: { receivedAt: "desc" },
    take: 10,
  });

  // Stream alerts (OBS overlay) state
  const ALL_ALERT_TYPES = [
    "shop_purchase", "event_win", "drop_claim_bonus",
    "twitch_sub", "twitch_gift_sub", "twitch_cheer",
    "donation", "welcome", "level_up", "test",
  ];
  const alertSettings = await prisma.streamAlertSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  const recentAlerts = await prisma.streamAlert.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const overlayConfigured =
    !!process.env.OVERLAY_TOKEN && process.env.OVERLAY_TOKEN !== "REPLACE_WITH_HEX_32_BYTES";

  const [totalUsers, sums, eventsActive, ordersPending] = stats;

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 right-1/3 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <AdminClient
          isAdmin={me.isAdmin}
          myPermissions={myPermissions}
          stats={{
            totalUsers,
            totalTokensInCirculation: sums._sum.tokens ?? 0,
            totalEverEarned: sums._sum.totalEarned ?? 0,
            eventsActive,
            ordersPending,
          }}
          drops={activeDrops.map((d) => ({
            id: d.id,
            code: d.code,
            reward: d.reward,
            bonusReward: d.bonusReward,
            bonusSlots: d.bonusSlots,
            expiresAt: d.expiresAt?.toISOString() ?? null,
            createdAt: d.createdAt.toISOString(),
            claimsCount: d._count.claims,
          }))}
          events={activeEvents.map((e) => ({
            id: e.id,
            type: e.type,
            name: e.name,
            startsAt: e.startsAt?.toISOString() ?? null,
            endsAt: e.endsAt?.toISOString() ?? null,
            entriesCount: e._count.entries,
            ticketsCount: e._count.raffleTickets,
          }))}
          pendingOrders={pendingOrders.map((t) => ({
            id: t.id,
            amount: t.amount,
            reason: t.reason,
            createdAt: t.createdAt.toISOString(),
            shopItem: t.shopItem,
            user: t.user,
          }))}
          auditLog={auditLog.map((a) => ({
            id: a.id,
            adminId: a.adminId,
            adminName: a.adminName,
            action: a.action,
            targetType: a.targetType,
            targetId: a.targetId,
            details: a.details,
            ipAddress: a.ipAddress,
            createdAt: a.createdAt.toISOString(),
          }))}
          allShopItems={allShopItems.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            category: s.category,
            price: s.price,
            imageEmoji: s.imageEmoji,
            stock: s.stock,
            totalStock: s.totalStock,
            hot: s.hot,
            active: s.active,
            featured: s.featured,
            requiresSubTier: s.requiresSubTier,
            requiresMinLevel: s.requiresMinLevel,
            requiresMinMonths: s.requiresMinMonths,
          }))}
          allEvents={activeEvents.map((e) => ({
            id: e.id,
            type: e.type,
            name: e.name,
            description: e.description,
            multiplier: e.multiplier,
            prize: e.prize,
            winnersCount: e.winnersCount,
            requirement: e.requirement,
            ticketPrice: e.ticketPrice,
            maxTicketsPerUser: e.maxTicketsPerUser,
            startsAt: e.startsAt?.toISOString() ?? null,
            endsAt: e.endsAt?.toISOString() ?? null,
            drawnAt: e.drawnAt?.toISOString() ?? null,
            active: e.active,
          }))}
          botConfig={botConfig}
          scheduleSlots={scheduleSlots.map((s) => ({
            id: s.id,
            dayOfWeek: s.dayOfWeek,
            startHour: s.startHour,
            startMinute: s.startMinute,
            durationMinutes: s.durationMinutes,
            title: s.title,
            platform: s.platform,
            active: s.active,
          }))}
          streamlabsConnection={streamlabsConn ? {
            connected: true,
            streamlabsUsername: streamlabsConn.streamlabsUsername,
            connectedAt: streamlabsConn.connectedAt.toISOString(),
            lastPolledAt: streamlabsConn.lastPolledAt?.toISOString() ?? null,
            lastSeenDonationId: streamlabsConn.lastSeenDonationId,
          } : { connected: false }}
          unmatchedDonations={unmatchedDonations.map((d) => ({
            id: d.id,
            externalId: d.externalId,
            donorName: d.donorName,
            message: d.message,
            amountGrosze: d.amountGrosze,
            currency: d.currency,
            donatedAt: d.donatedAt.toISOString(),
          }))}
          twitchEventSub={{
            streamerConnected: !!twitchStreamer,
            broadcasterLogin: twitchStreamer?.broadcasterLogin ?? null,
            broadcasterId: twitchStreamer?.broadcasterId ?? null,
            connectedAt: twitchStreamer?.connectedAt.toISOString() ?? null,
            subscriptions: twitchSubs.map((s) => ({
              id: s.id,
              type: s.type,
              status: s.status,
              lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
              createdAt: s.createdAt.toISOString(),
            })),
            recentEvents: recentTwitchEvents.map((e) => ({
              id: e.id,
              type: e.type,
              userId: e.userId,
              tokensGranted: e.tokensGranted,
              receivedAt: e.receivedAt.toISOString(),
            })),
          }}
          streamAlerts={{
            overlayConfigured,
            settings: {
              enabledTypes: alertSettings.enabledTypes,
              durationMs: alertSettings.durationMs,
              accentColor: alertSettings.accentColor,
              soundEnabled: alertSettings.soundEnabled,
            },
            allTypes: ALL_ALERT_TYPES,
            recent: recentAlerts.map((a) => ({
              id: a.id,
              type: a.type,
              title: a.title,
              message: a.message,
              icon: a.icon,
              actorName: a.actorName,
              amount: a.amount,
              amountLabel: a.amountLabel,
              createdAt: a.createdAt.toISOString(),
              shownAt: a.shownAt?.toISOString() ?? null,
            })),
          }}
        />
      </main>
    </div>
  );
}
