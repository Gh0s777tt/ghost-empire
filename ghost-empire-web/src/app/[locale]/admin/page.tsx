// src/app/admin/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { AdminClient } from "@/components/admin/AdminClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin", description: "Panel administracyjny Ghost Empire" };

export default async function AdminPage() {
  const session = await auth();
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

  // Only the DEFAULT (Dashboard) view's data is fetched server-side. Every other
  // section lazy-loads its own data on open via /api/admin/section-data, so the
  // initial /admin render went from ~18 queries to these 7.
  const [
    totalUsers, sums, eventsActive, ordersPending,
    activeDrops, activeEvents, pendingOrders,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.aggregate({ _sum: { tokens: true, totalEarned: true } }),
    prisma.event.count({ where: { active: true } }),
    prisma.transaction.count({ where: { type: "spend", status: "pending" } }),
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
      include: { _count: { select: { entries: true, raffleTickets: true } } },
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
        />
      </main>
    </div>
  );
}
