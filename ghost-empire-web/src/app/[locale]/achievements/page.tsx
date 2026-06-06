// src/app/achievements/page.tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { AchievementsClient } from "@/components/achievements/AchievementsClient";
import { getCachedAchievementsMeta } from "@/lib/cached";

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "achievements" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/achievements", locale) };
}

export default async function AchievementsPage() {
  const session = await auth();
  const userId = session?.user?.id;

  // Global list + earned-counts come from cache (public, 120s). User-specific
  // bits (myEarned, me) stay live.
  const [meta, myEarned, me] = await Promise.all([
    getCachedAchievementsMeta(),
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

  const allAchievements = meta.achievements;
  const totalUsers = meta.totalUsers;

  const earnedMap = new Map(
    meta.earnedCounts.map((e) => [e.achievementId, e.count]),
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
