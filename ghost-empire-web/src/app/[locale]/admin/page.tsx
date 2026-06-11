// src/app/admin/page.tsx
import { redirect } from "next/navigation";
import { auth, isPermanentAdminEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId, getCurrentTenant } from "@/lib/tenant";
import { Header } from "@/components/Header";
import { AdminClient } from "@/components/admin/AdminClient";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getCurrentTenant();
  return { title: "Admin", description: `Panel administracyjny ${t.name}` };
}

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/admin");
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, isModerator: true, modPermissions: true, isBanned: true, tenantId: true, email: true },
  });

  // Allow admins + moderators (any permissions). Block everyone else.
  if (!me || me.isBanned || (!me.isAdmin && !me.isModerator)) {
    redirect("/?denied=admin");
  }


  // Admin has implicit all permissions; mod has whatever's in their array.
  const myPermissions: string[] = me.isAdmin
    ? ["__all__"]   // sentinel — AdminClient treats this as "all"
    : me.modPermissions;

  const tid = await currentTenantId();

  // Cross-tenant guard (SaaS Phase 4): admin of tenant A on tenant B's subdomain
  // gets bounced — global isAdmin alone must not grant another tenant's panel.
  // Platform owner passes; NULL tenantId (legacy) self-heals on login.
  if (me.tenantId && tid && me.tenantId !== tid && !isPermanentAdminEmail(me.email)) {
    redirect("/?denied=admin");
  }

  // Only the DEFAULT (Dashboard) view's data is fetched server-side. Every other
  // section lazy-loads its own data on open via /api/admin/section-data, so the
  // initial /admin render went from ~18 queries to these 7. All scoped to the
  // admin's tenant (counts via User.tenantId; collections + transactions via theirs).
  const [
    totalUsers, sums, eventsActive, ordersPending,
    activeDrops, activeEvents, pendingOrders,
  ] = await Promise.all([
    prisma.user.count({ where: tid ? { tenantId: tid } : {} }),
    prisma.user.aggregate({ _sum: { tokens: true, totalEarned: true }, where: tid ? { tenantId: tid } : {} }),
    prisma.event.count({ where: { active: true, ...(tid ? { tenantId: tid } : {}) } }),
    prisma.transaction.count({ where: { type: "spend", status: "pending", ...(tid ? { user: { tenantId: tid } } : {}) } }),
    prisma.streamDrop.findMany({
      where: { active: true, ...(tid ? { tenantId: tid } : {}) },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { claims: true } } },
    }),
    prisma.event.findMany({
      where: { active: true, ...(tid ? { tenantId: tid } : {}) },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { entries: true, raffleTickets: true } } },
    }),
    prisma.transaction.findMany({
      where: { type: "spend", status: "pending", ...(tid ? { user: { tenantId: tid } } : {}) },
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
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <AdminClient
          isAdmin={me.isAdmin}
          isPlatformOwner={isPermanentAdminEmail(me.email)}
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
