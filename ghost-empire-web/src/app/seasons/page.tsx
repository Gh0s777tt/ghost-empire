// src/app/seasons/page.tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { SeasonsClient } from "@/components/seasons/SeasonsClient";
import { getOrCreateCurrentSeason } from "@/lib/seasons";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Battle Pass",
  description: "Zdobywaj XP sezonowe za aktywność i odbieraj nagrody na kolejnych tierach.",
};

export default async function SeasonsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const season = await getOrCreateCurrentSeason();

  const [rewards, progress, claims] = await Promise.all([
    prisma.seasonReward.findMany({
      where: { seasonId: season.id },
      orderBy: [{ tier: "asc" }, { premium: "asc" }],
    }),
    userId
      ? prisma.userSeasonProgress.findUnique({
          where: { userId_seasonId: { userId, seasonId: season.id } },
        })
      : Promise.resolve(null),
    userId
      ? prisma.userSeasonRewardClaim.findMany({
          where: { userId, reward: { seasonId: season.id } },
          select: { rewardId: true },
        })
      : Promise.resolve([]),
  ]);

  const claimedIds = new Set(claims.map((c) => c.rewardId));
  const userTier = progress?.tier ?? 0;
  const userXp = progress?.xp ?? 0;
  const isPremium = progress?.premium ?? false;

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <SeasonsClient
          isAuthenticated={!!userId}
          season={{
            number: season.number,
            name: season.name,
            description: season.description,
            endsAt: season.endsAt.toISOString(),
            totalTiers: season.totalTiers,
            xpPerTier: season.xpPerTier,
          }}
          userXp={userXp}
          userTier={userTier}
          isPremium={isPremium}
          rewards={rewards.map((r) => ({
            id: r.id,
            tier: r.tier,
            premium: r.premium,
            type: r.type,
            label: r.label,
            icon: r.icon,
            claimed: claimedIds.has(r.id),
          }))}
        />
      </main>
    </div>
  );
}
