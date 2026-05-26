// src/app/ranking/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { RankingClient } from "@/components/ranking/RankingClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ranking",
  description: "Najlepsi członkowie Ghost Empire — top tokeny, level, streak.",
};

const VALID_SORTS = ["tokens", "totalEarned", "level", "streak"] as const;
type Sort = (typeof VALID_SORTS)[number];

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const params = await searchParams;
  const sort: Sort = (VALID_SORTS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as Sort)
    : "tokens";

  const session = await getServerSession(authOptions);

  // Compute admin/mod permissions for quick-actions modal
  let canGrantTokens = false;
  let canSetRole = false;
  let canBan = false;
  if (session?.user?.id) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAdmin: true, isModerator: true, modPermissions: true, isBanned: true },
    });
    if (me && !me.isBanned) {
      canSetRole = me.isAdmin;  // Granting admin/mod is admin-only
      canGrantTokens = me.isAdmin || (me.isModerator && me.modPermissions.includes("grant_tokens"));
      canBan = me.isAdmin || (me.isModerator && me.modPermissions.includes("ban_users"));
    }
  }
  const canDoAnything = canGrantTokens || canSetRole || canBan;

  // Order strategy: primary field DESC, then secondary tiebreakers
  const orderBy =
    sort === "level"
      ? [{ level: "desc" as const }, { xp: "desc" as const }]
      : [{ [sort]: "desc" as const }];

  // Only count users with non-zero value on the sorted field — keeps the
  // ranking from being polluted by brand-new accounts with all zeros.
  const where = { [sort]: { gt: 0 } };

  const [topUsers, totalRanked, totalUsers] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      take: 100,
      select: {
        id: true,
        username: true,
        displayName: true,
        name: true,
        image: true,
        tokens: true,
        totalEarned: true,
        level: true,
        xp: true,
        streak: true,
        isAdmin: true,
        isBanned: true,
      },
    }),
    prisma.user.count({ where }),
    prisma.user.count(),
  ]);

  // Compute current user's rank if not in top 100
  let myRank: {
    position: number;
    user: (typeof topUsers)[number];
  } | null = null;

  if (session?.user?.id) {
    const inTop = topUsers.find((u) => u.id === session.user.id);
    if (!inTop) {
      const me = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          username: true,
          displayName: true,
          name: true,
          image: true,
          tokens: true,
          totalEarned: true,
          level: true,
          xp: true,
          streak: true,
          isAdmin: true,
          isBanned: true,
        },
      });
      if (me) {
        const myValue = me[sort];
        if (myValue && myValue > 0) {
          // Count users strictly ahead. For level we tiebreak by xp.
          const ahead =
            sort === "level"
              ? await prisma.user.count({
                  where: {
                    OR: [
                      { level: { gt: me.level } },
                      { level: me.level, xp: { gt: me.xp } },
                    ],
                  },
                })
              : await prisma.user.count({
                  where: { [sort]: { gt: myValue } },
                });
          myRank = { position: ahead + 1, user: me };
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <RankingClient
          sort={sort}
          topUsers={topUsers}
          totalRanked={totalRanked}
          totalUsers={totalUsers}
          currentUserId={session?.user?.id ?? null}
          myRank={myRank}
          isAdmin={canDoAnything}
          permissions={{ canGrantTokens, canSetRole, canBan }}
        />
      </main>
    </div>
  );
}
