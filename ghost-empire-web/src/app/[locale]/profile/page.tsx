// src/app/profile/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { Header } from "@/components/Header";
import { ProfileClient } from "@/components/profile/ProfileClient";
import { PushToggle } from "@/components/push/PushToggle";
import { PasskeyManager } from "@/components/profile/PasskeyManager";
import { ShippingProfileCard } from "@/components/profile/ShippingProfileCard";
import { DonationCodeCard } from "@/components/profile/DonationCodeCard";
import { companionStage } from "@/lib/companion";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profil" };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/profile");
  }

  const userId = session.user.id;
  const tid = await currentTenantId();

  const [user, connections, earnedAchievements, allAchievements, socialLinks, transactions, linkedAccounts, duelWins, duelLosses, companion, clanWrap] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          username: true,
          displayName: true,
          bio: true,
          country: true,
          profileAccent: true,
          image: true,
          tokens: true,
          totalEarned: true,
          totalSpent: true,
          level: true,
          xp: true,
          prestige: true,
          streak: true,
          messageCount: true,
          voiceMinutes: true,
          isAdmin: true,
          isModerator: true,
          isDonator: true,
          totalDonated: true,
          discordId: true,
          isBanned: true,
          bannedUntil: true,
          banReason: true,
          createdAt: true,
        },
      }),
      prisma.connection.findMany({
        where: { userId },
        orderBy: { connectedAt: "asc" },
      }),
      prisma.userAchievement.findMany({
        where: { userId },
        include: { achievement: true },
        orderBy: { earnedAt: "desc" },
      }),
      prisma.achievement.findMany({
        where: { hidden: false, ...(tid ? { tenantId: tid } : {}) },
        orderBy: [{ rarity: "asc" }, { triggerValue: "asc" }],
      }),
      prisma.socialLink.findMany({
        where: { userId },
        orderBy: { platform: "asc" },
      }),
      prisma.transaction.findMany({
        where: { userId },
        include: { shopItem: { select: { name: true, imageEmoji: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.account.findMany({
        where: { userId },
        select: { provider: true, providerAccountId: true },
      }),
      // PvP duel record (resolved duels this user took part in).
      prisma.duel.count({ where: { status: "resolved", winnerId: userId } }),
      prisma.duel.count({
        where: {
          status: "resolved",
          winnerId: { not: userId },
          OR: [{ challengerId: userId }, { opponentId: userId }],
        },
      }),
      prisma.companion.findUnique({ where: { userId }, select: { xp: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { clan: { select: { tag: true, name: true, treasury: true } } } }),
    ]);

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <ProfileClient
          user={{
            ...user,
            createdAt: user.createdAt.toISOString(),
            bannedUntil: user.bannedUntil?.toISOString() ?? null,
          }}
          connections={connections.map((c) => ({
            ...c,
            connectedAt: c.connectedAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
            tokenExpiry: c.tokenExpiry?.toISOString() ?? null,
            subStartDate: c.subStartDate?.toISOString() ?? null,
            accessToken: null,
            refreshToken: null,
          }))}
          earnedAchievements={earnedAchievements.map((ua) => ({
            id: ua.id,
            earnedAt: ua.earnedAt.toISOString(),
            achievement: ua.achievement,
          }))}
          allAchievements={allAchievements}
          socialLinks={socialLinks}
          transactions={transactions.map((t) => ({
            ...t,
            createdAt: t.createdAt.toISOString(),
          }))}
          linkedAccounts={linkedAccounts}
          duelStats={{ wins: duelWins, losses: duelLosses }}
          companion={companion ? { xp: companion.xp, emoji: companionStage(companion.xp).emoji } : null}
          clan={clanWrap?.clan ?? null}
        />
        <div className="max-w-md mx-auto mt-6 space-y-4">
          <PushToggle />
          <PasskeyManager />
          <DonationCodeCard />
          <ShippingProfileCard />
        </div>
      </main>
    </div>
  );
}
