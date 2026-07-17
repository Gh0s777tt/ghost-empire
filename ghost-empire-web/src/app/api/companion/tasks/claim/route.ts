// src/app/api/companion/tasks/claim/route.ts
// Odbieranie nagrody za dzienny quest z rozszerzenia NX Companion (cross-origin).
// Auth: sesja (portal UI) LUB companion bearer token (== tenant), jak w
// GET /api/companion/tasks. Logika claim jest ŚWIADOMYM LUSTREM
// src/app/api/tasks/claim (ten sam atomowy guard `claimed:false` przeciw podwójnemu
// creditowi — jedyne źródło prawdy dla creditingu). Różnice względem tamtej:
//   1) tenant rozwiązany PRZED auth + akceptacja bearer tokenu (== tenant),
//   2) CORS (rozszerzenie woła cross-origin),
//   3) izolacja multi-tenant: token/sesja tenanta A NIE odbiera questa tenanta B.
// Celowo NIE refaktoryzuję żywej ścieżki `tasks/claim` (endpoint pieniężny) —
// zmiana jest addytywna. Ewentualną wspólną lib można wydzielić osobno.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentTenant } from "@/lib/tenant";
import { bearerFromRequest, verifyCompanionToken } from "@/lib/companion-token";
import { today } from "@/lib/utils";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

/** Rzucane w transakcji, gdy równoległe żądanie odebrało quest pierwsze → rollback
 *  zamiast podwójnego creditu (identycznie jak w kanonicznym tasks/claim). */
class AlreadyClaimedError extends Error {}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const tenant = await getCurrentTenant();
  const tid = tenant.id;

  const session = await auth();
  let userId = session?.user?.id ?? null;
  if (!userId) {
    const payload = verifyCompanionToken(bearerFromRequest(req));
    if (payload && payload.tenantId === tid) userId = payload.userId;
  }
  if (!userId) return json({ error: "Musisz być zalogowany" }, 401);
  const uid = userId; // stały string do domknięć transakcji (narrowing)

  const rl = await rateLimit(`companion:tasks:claim:${uid}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele żądań. Spróbuj ponownie za chwilę." },
      { status: 429, headers: { ...CORS, ...rateLimitHeaders(rl) } },
    );
  }

  let body: { taskId?: unknown };
  try {
    body = (await req.json()) as { taskId?: unknown };
  } catch {
    return json({ error: "Nieprawidłowe dane" }, 400);
  }
  const taskId = body.taskId;
  if (typeof taskId !== "string" || !taskId) {
    return json({ error: "Missing taskId" }, 400);
  }

  const userTask = await prisma.userTask.findUnique({
    where: { userId_taskId_date: { userId: uid, taskId, date: today() } },
    include: { task: true },
  });
  if (!userTask) return json({ error: "Task not found" }, 404);
  // Izolacja tenanta na endpointcie pieniężnym: quest musi należeć do tego tenanta.
  if (tid && userTask.task.tenantId !== tid) return json({ error: "Task not found" }, 404);
  if (userTask.claimed) return json({ error: "Already claimed" }, 409);
  if (userTask.progress < userTask.task.target) return json({ error: "Task not completed" }, 400);

  let newBalance: number;
  try {
    newBalance = await prisma.$transaction(async (tx) => {
      const claim = await tx.userTask.updateMany({
        where: { userId: uid, taskId, date: today(), claimed: false },
        data: { claimed: true, claimedAt: new Date() },
      });
      if (claim.count === 0) throw new AlreadyClaimedError();
      await tx.transaction.create({
        data: {
          userId: uid,
          type: "earn",
          amount: userTask.task.reward,
          reason: `daily_task:${userTask.task.code}`,
        },
      });
      const updatedUser = await tx.user.update({
        where: { id: uid },
        data: {
          tokens: { increment: userTask.task.reward },
          totalEarned: { increment: userTask.task.reward },
        },
      });
      return updatedUser.tokens;
    });
  } catch (e) {
    if (e instanceof AlreadyClaimedError) return json({ error: "Already claimed" }, 409);
    throw e;
  }

  return json({ ok: true, reward: userTask.task.reward, newBalance });
}
