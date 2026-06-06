// src/app/quests/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { QuestsClient } from "@/components/quests/QuestsClient";
import { today } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Daily Questy",
  description: "Codzienne zadania w Ghost Empire — wykonuj, claimuj nagrody.",
};

export default async function QuestsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/quests");
  }

  const userId = session.user.id;
  const dateStr = today();

  // Ensure UserTask records exist for today for every active DailyTask.
  const activeTasks = await prisma.dailyTask.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
  });

  for (const t of activeTasks) {
    await prisma.userTask.upsert({
      where: { userId_taskId_date: { userId, taskId: t.id, date: dateStr } },
      create: { userId, taskId: t.id, date: dateStr },
      update: {},
    });
  }

  const [userTasks, user] = await Promise.all([
    prisma.userTask.findMany({
      where: { userId, date: dateStr },
      include: { task: true },
      orderBy: { task: { code: "asc" } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { streak: true, tokens: true },
    }),
  ]);

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #FF4500 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <QuestsClient
          tasks={userTasks.map((ut) => ({
            id: ut.id,
            taskId: ut.taskId,
            progress: ut.progress,
            done: ut.done,
            claimed: ut.claimed,
            claimedAt: ut.claimedAt?.toISOString() ?? null,
            task: {
              code: ut.task.code,
              text: ut.task.text,
              textEn: ut.task.textEn,
              target: ut.task.target,
              reward: ut.task.reward,
              bonusReward: ut.task.bonusReward,
              triggerType: ut.task.triggerType,
            },
          }))}
          streak={user?.streak ?? 0}
          balance={user?.tokens ?? 0}
        />
      </main>
    </div>
  );
}
