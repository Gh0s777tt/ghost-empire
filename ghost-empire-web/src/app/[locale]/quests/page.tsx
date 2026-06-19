// src/app/quests/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { Header } from "@/components/Header";
import { QuestsClient } from "@/components/quests/QuestsClient";
import { today } from "@/lib/utils";

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "quests" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/quests", locale) };
}

export default async function QuestsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/quests");
  }

  const userId = session.user.id;
  const dateStr = today();
  const tid = await currentTenantId();

  // Ensure a UserTask row exists for each active daily task (today). Was N
  // sequential upserts on EVERY page load; now create only the missing rows in
  // one createMany and refetch only when we actually created something (mirrors
  // the home page). Common case (rows already exist) = zero extra writes.
  const [activeTasks, userTasksInitial, user] = await Promise.all([
    prisma.dailyTask.findMany({ where: { active: true, ...(tid ? { tenantId: tid } : {}) }, select: { id: true } }),
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

  const missingTaskIds = activeTasks
    .filter((t) => !userTasksInitial.some((ut) => ut.taskId === t.id))
    .map((t) => t.id);

  let userTasks = userTasksInitial;
  if (missingTaskIds.length > 0) {
    await prisma.userTask.createMany({
      data: missingTaskIds.map((taskId) => ({ userId, taskId, date: dateStr })),
      skipDuplicates: true,
    });
    userTasks = await prisma.userTask.findMany({
      where: { userId, date: dateStr },
      include: { task: true },
      orderBy: { task: { code: "asc" } },
    });
  }

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
