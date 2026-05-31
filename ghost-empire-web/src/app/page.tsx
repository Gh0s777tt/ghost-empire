// src/app/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { HomeClient } from "@/components/home/HomeClient";
import { FirstVisitRedirect } from "@/components/FirstVisitRedirect";
import { today } from "@/lib/utils";
import { getCachedTopUsers } from "@/lib/cached";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  // Parallel data fetching. topUsers is cached (public, no Date fields → safe);
  // hot items + events stay live (tiny take: 3/4 queries).
  const [hotItems, activeEvents, topUsers] = await Promise.all([
    // Hot items from shop
    prisma.shopItem.findMany({
      where: { active: true, hot: true },
      orderBy: { sortOrder: "asc" },
      take: 3,
    }),

    // Active events
    prisma.event.findMany({
      where: {
        active: true,
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      },
      take: 4,
      orderBy: { createdAt: "desc" },
    }),

    // Top 3 for quick ranking preview (cached 60s)
    getCachedTopUsers(3),
  ]);

  // User-specific data (only if logged in)
  let userData = null;
  if (session?.user?.id) {
    const uid = session.user.id;
    const [user, connections, achievements, tasks, activeDailyTaskIds] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          username: true,
          displayName: true,
          image: true,
          tokens: true,
          totalEarned: true,
          totalSpent: true,
          level: true,
          xp: true,
          streak: true,
          messageCount: true,
          isAdmin: true,
        },
      }),
      prisma.connection.findMany({
        where: { userId: session.user.id },
        select: {
          platform: true,
          username: true,
          isSubscriber: true,
          subTier: true,
          subMonths: true,
          followers: true,
        },
      }),
      prisma.userAchievement.findMany({
        where: { userId: session.user.id },
        include: {
          achievement: {
            select: { code: true, name: true, icon: true, rarity: true },
          },
        },
        orderBy: { earnedAt: "desc" },
        take: 6,
      }),
      prisma.userTask.findMany({
        where: {
          userId: session.user.id,
          date: today(),
        },
        include: {
          task: {
            select: {
              id: true,
              code: true,
              text: true,
              target: true,
              reward: true,
              triggerType: true,
            },
          },
        },
      }),

      // Active daily-task IDs — fetched in parallel so ensuring the user's rows
      // doesn't need a separate sequential round-trip.
      prisma.dailyTask.findMany({
        where: { active: true },
        select: { id: true },
      }),
    ]);

    // Ensure a UserTask row exists for each active daily task (today). Previously
    // this ran N sequential upserts on EVERY home load + an unconditional refetch.
    // Now: create only the missing rows in one createMany, and refetch only if we
    // actually created something (the common case = no missing = zero extra queries).
    const missingTaskIds = activeDailyTaskIds
      .filter((t) => !tasks.some((ut) => ut.taskId === t.id))
      .map((t) => t.id);

    let effectiveTasks = tasks;
    if (missingTaskIds.length > 0) {
      await prisma.userTask.createMany({
        data: missingTaskIds.map((taskId) => ({ userId: uid, taskId, date: today() })),
        skipDuplicates: true,
      });
      effectiveTasks = await prisma.userTask.findMany({
        where: { userId: uid, date: today() },
        include: {
          task: {
            select: {
              id: true,
              code: true,
              text: true,
              target: true,
              reward: true,
              triggerType: true,
            },
          },
        },
      });
    }

    userData = { user, connections, achievements, tasks: effectiveTasks };
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[130px] opacity-15"
          style={{
            background:
              "radial-gradient(circle, #E50914 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full blur-[150px] opacity-10"
          style={{
            background:
              "radial-gradient(circle, #8B0000 0%, transparent 70%)",
          }}
        />
      </div>

      <Header />
      <FirstVisitRedirect />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <HomeClient
          session={session}
          userData={userData}
          hotItems={hotItems}
          activeEvents={activeEvents.map((e) => ({
            ...e,
            startsAt: e.startsAt?.toISOString() ?? null,
            endsAt: e.endsAt?.toISOString() ?? null,
            createdAt: e.createdAt.toISOString(),
            updatedAt: e.updatedAt.toISOString(),
          }))}
          topUsers={topUsers}
        />
      </main>
    </div>
  );
}
