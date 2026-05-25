// src/app/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { HomeClient } from "@/components/home/HomeClient";
import { today } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  // Parallel data fetching
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

    // Top 3 for quick ranking preview
    prisma.user.findMany({
      where: { tokens: { gt: 0 } },
      orderBy: { tokens: "desc" },
      take: 3,
      select: {
        id: true,
        username: true,
        displayName: true,
        image: true,
        tokens: true,
        level: true,
      },
    }),
  ]);

  // User-specific data (only if logged in)
  let userData = null;
  if (session?.user?.id) {
    const [user, connections, achievements, tasks] = await Promise.all([
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
    ]);

    // Ensure all 3 daily tasks exist for today
    const allTasks = await prisma.dailyTask.findMany({
      where: { active: true },
    });

    for (const t of allTasks) {
      const exists = tasks.find((ut) => ut.taskId === t.id);
      if (!exists && session.user.id) {
        await prisma.userTask.upsert({
          where: {
            userId_taskId_date: {
              userId: session.user.id,
              taskId: t.id,
              date: today(),
            },
          },
          update: {},
          create: {
            userId: session.user.id,
            taskId: t.id,
            date: today(),
          },
        });
      }
    }

    // Refetch tasks after ensuring they exist
    const updatedTasks = await prisma.userTask.findMany({
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
    });

    userData = { user, connections, achievements, tasks: updatedTasks };
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
