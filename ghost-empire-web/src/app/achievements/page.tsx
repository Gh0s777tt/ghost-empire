// src/app/achievements/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { AchievementsClient } from "@/components/achievements/AchievementsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Osiągnięcia",
  description: "Wszystkie 22 osiągnięcia Ghost Empire — common, rare, epic, legendary.",
};

export default async function AchievementsPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const [allAchievements, totalUsers, earnedCounts, myEarned, me] =
    await Promise.all([
      prisma.achievement.findMany({
        orderBy: [{ rarity: "asc" }, { triggerValue: "asc" }, { name: "asc" }],
      }),
      prisma.user.count(),
      prisma.userAchievement.groupBy({
        by: ["achievementId"],
        _count: { id: true },
      }),
      userId
        ? prisma.userAchievement.findMany({
            where: { userId },
            select: { achievementId: true, earnedAt: true },
          })
        : Promise.resolve([]),
      userId
        ? prisma.user.findUnique({
            where: { id: userId },
            select: {
              level: true,
              totalEarned: true,
              streak: true,
              messageCount: true,
            },
          })
        : Promise.resolve(null),
    ]);

  const earnedMap = new Map(
    earnedCounts.map((e) => [e.achievementId, e._count.id]),
  );
  const myEarnedMap = new Map(
    myEarned.map((m) => [m.achievementId, m.earnedAt.toISOString()]),
  );

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #a855f7 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-1/4 left-0 w-[500px] h-[500px] rounded-full blur-[130px] opacity-10"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <AchievementsClient
          achievements={allAchievements.map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            description: a.description,
            icon: a.icon,
            rarity: a.rarity,
            hidden: a.hidden,
            triggerType: a.triggerType,
            triggerValue: a.triggerValue,
            xpReward: a.xpReward,
            tokenReward: a.tokenReward,
            globalEarnedCount: earnedMap.get(a.id) ?? 0,
            myEarnedAt: myEarnedMap.get(a.id) ?? null,
          }))}
          totalUsers={totalUsers}
          isAuthenticated={!!userId}
          userStats={me}
        />
      </main>
    </div>
  );
}
