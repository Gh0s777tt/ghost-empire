// src/app/api/companion/tasks/route.ts
// Read-only: dzienne questy zalogowanego usera na DZIŚ (progress/done/claimed).
// Auth: sesja (portal UI) LUB companion bearer token (rozszerzenie NX Companion,
// cross-origin). NIGDY nie pisze — w przeciwieństwie do strony /quests NIE tworzy
// brakujących wierszy UserTask (companion tylko czyta). Multi-tenant: tenant
// rozwiązany PRZED auth, token musi być zmintowany na tym samym portalu (#qa D-3).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { getCurrentTenant } from "@/lib/tenant";
import { bearerFromRequest, verifyCompanionToken } from "@/lib/companion-token";
import { today } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const tenant = await getCurrentTenant();
  const tid = tenant.id;

  const session = await auth();
  let userId = session?.user?.id ?? null;
  if (!userId) {
    const payload = verifyCompanionToken(bearerFromRequest(req));
    if (payload && payload.tenantId === tid) userId = payload.userId;
  }
  if (!userId) return jsonError("Musisz być zalogowany", 401);

  const date = today();
  const [activeTasks, userTasks] = await Promise.all([
    prisma.dailyTask.findMany({
      where: { active: true, ...(tid ? { tenantId: tid } : {}) },
      select: { id: true, text: true, textEn: true, target: true, reward: true, bonusReward: true },
      orderBy: { reward: "asc" },
    }),
    prisma.userTask.findMany({
      where: { userId, date },
      select: { taskId: true, progress: true, done: true, claimed: true },
    }),
  ]);
  const byTask = new Map(userTasks.map((ut) => [ut.taskId, ut]));

  const tasks = activeTasks.map((t) => {
    const ut = byTask.get(t.id);
    return {
      id: t.id,
      text: t.text,
      textEn: t.textEn,
      target: t.target,
      reward: t.reward,
      bonusReward: t.bonusReward,
      progress: ut?.progress ?? 0,
      done: ut?.done ?? false,
      claimed: ut?.claimed ?? false,
    };
  });

  return NextResponse.json(
    { date, tasks, claimable: tasks.filter((t) => t.done && !t.claimed).length },
    { headers: CORS },
  );
}
