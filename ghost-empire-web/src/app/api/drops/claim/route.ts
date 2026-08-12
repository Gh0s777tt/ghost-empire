// src/app/api/drops/claim/route.ts
// Auth: sesja (portal UI) LUB companion bearer token (rozszerzenie NX Companion).
// Finding "companion nie odbierze drop kodu / daily bonusa": ten endpoint był
// session-only, a rozszerzenie woła go z MV3 service workera — czyli CROSS-ORIGIN,
// więc cookie sesji (SameSite=Lax) NIE jest wysyłane, a wysyłany Bearer był
// ignorowany → gwarantowane 401 na funkcji reklamowanej w obu store listingach.
// Ścieżka bearer istnieje wyłącznie z tego powodu. Wzorzec 1:1 jak
// /api/companion/tasks/claim: tenant rozwiązany PRZED auth, a token MUSI być
// zmintowany na TYM portalu — bez tej równości token z portalu A odebrałby drop
// na portalu B (cross-tenant, #qa D-3). CORS + OPTIONS są obowiązkowe, inaczej
// preflight (Bearer + content-type) pada i fix jest martwy.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { getCurrentTenant } from "@/lib/tenant";
import { bearerFromRequest, verifyCompanionToken } from "@/lib/companion-token";
import { today } from "@/lib/utils";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { dispatchAlertSafe } from "@/lib/alerts";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { awardSeasonXp } from "@/lib/seasons";
import { createLogger } from "@/lib/logger";

const log = createLogger("drops");

const CODE_REGEX = /^[A-Z0-9_-]{3,24}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  // One request-cached tenant read (getCurrentTenant is cache()d, and currentTenantId only
  // wraps it): `id` scopes the drop/quest lookups, `tokenSymbol` labels the bonus alert below
  // with THIS portal's currency instead of the founder's hardcoded "GT". Read BEFORE auth so
  // a bearer token's tenant scope can be compared against the Host-resolved portal.
  const tenant = await getCurrentTenant();
  const tid = tenant.id;

  const session = await auth();
  let actorId = session?.user?.id ?? null;
  if (!actorId) {
    const payload = verifyCompanionToken(bearerFromRequest(req));
    if (payload && payload.tenantId === tid) actorId = payload.userId;
  }
  if (!actorId) {
    return jsonError("Musisz być zalogowany", 401, CORS);
  }
  // Stały string dla domknięć transakcji (narrowing) — KAŻDE zapytanie niżej
  // (claim, credit, questy, notyfikacja, achievementy, XP) używa właśnie tego id,
  // niezależnie od tego, który credential uwierzytelnił żądanie.
  const userId = actorId;

  let body: { code?: string };
  try { body = await req.json(); } catch {
    return jsonError("Nieprawidłowe dane", 400, CORS);
  }

  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) return jsonError("Brak kodu", 400, CORS);
  if (!CODE_REGEX.test(code)) {
    return jsonError("Kod: 3-24 znaków A-Z, 0-9, _, -", 400, CORS);
  }

  // Anti-brute-force: max 30 attempts per minute per user (trying random codes)
  const rl = await rateLimit(`drop:claim:${userId}`, 30, 60_000);
  if (!rl.allowed) {
    return jsonError("Za dużo prób. Poczekaj chwilę.", 429, { ...CORS, ...rateLimitHeaders(rl) });
  }

  const drop = await prisma.streamDrop.findFirst({ where: { code, ...(tid ? { tenantId: tid } : {}) } });
  if (!drop) return jsonError("Kod nie istnieje", 404, CORS);
  if (!drop.active) return jsonError("Kod nieaktywny", 410, CORS);
  if (drop.expiresAt && drop.expiresAt < new Date()) {
    return jsonError("Kod wygasł", 410, CORS);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Reserve the claim FIRST — the unique (dropId, userId) throws P2002 on a repeat,
      // rolling the whole tx back before we touch the counter. reward is backfilled below.
      const claim = await tx.dropClaim.create({ data: { dropId: drop.id, userId, reward: 0 } });

      // Atomic ordinal (#audit-M4): the row-locked increment serializes concurrent
      // claimers, so exactly the first `bonusSlots` get an ordinal within range. The old
      // out-of-tx count() let N racers all read 0 and all grab the bonus reward.
      const { claimCount } = await tx.streamDrop.update({
        where: { id: drop.id },
        data: { claimCount: { increment: 1 } },
        select: { claimCount: true },
      });
      const getsBonus = drop.bonusReward > 0 && claimCount <= drop.bonusSlots;
      const totalReward = drop.reward + (getsBonus ? drop.bonusReward : 0);
      await tx.dropClaim.update({ where: { id: claim.id }, data: { reward: totalReward } });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          tokens: { increment: totalReward },
          totalEarned: { increment: totalReward },
        },
        select: { tokens: true, username: true, displayName: true, image: true },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "earn",
          amount: totalReward,
          reason: `drop:${drop.code}${getsBonus ? "_bonus" : ""}`,
          status: "completed",
        },
      });

      // Daily quest progress: drop_code (per-tenant — only this portal's quests)
      const dropTasks = await tx.dailyTask.findMany({
        where: { triggerType: "drop_code", active: true, ...(tid ? { tenantId: tid } : {}) },
      });
      for (const task of dropTasks) {
        await tx.userTask.upsert({
          where: {
            userId_taskId_date: { userId, taskId: task.id, date: today() },
          },
          create: { userId, taskId: task.id, date: today(), progress: 1 },
          update: { progress: { increment: 1 } },
        });
      }

      await tx.notification.create({
        data: {
          userId,
          type: "task_reward",
          title: getsBonus ? "Drop claimed (BONUS)!" : "Drop claimed!",
          message: getsBonus
            ? `Pierwsi ${drop.bonusSlots} łapie bonus! +${totalReward} GT za kod ${drop.code}.`
            : `+${totalReward} GT za kod ${drop.code}.`,
          icon: getsBonus ? "🌟" : "🎁",
          link: "/profile",
        },
      });

      return {
        ok: true,
        code: drop.code,
        reward: drop.reward,
        bonusReward: getsBonus ? drop.bonusReward : 0,
        totalReward,
        gotBonus: getsBonus,
        bonusSlotsLeft: Math.max(0, drop.bonusSlots - claimCount),
        newBalance: updatedUser.tokens,
        _actor: {
          name: updatedUser.displayName || updatedUser.username || "Anon",
          image: updatedUser.image ?? null,
        },
      };
    });

    // Stream alert only for bonus claims (first N grabbers) — non-bonus claims would spam
    if (result.gotBonus) {
      await dispatchAlertSafe({
        type: "drop_claim_bonus",
        title: "🌟 Bonus drop złapany!",
        message: `złapał bonusowy kod ${drop.code}`,
        icon: "🌟",
        actorName: result._actor.name,
        actorImage: result._actor.image ?? undefined,
        amount: result.totalReward,
        // Drops always pay the real-economy token → this portal's own symbol.
        amountLabel: tenant.tokenSymbol,
      });
    }

    // Achievement check — drops claimed milestones + season XP
    await checkAndGrantAchievements({ userId, triggerType: "drops_claimed" });
    await awardSeasonXp(userId, "drop_claim");

    const { _actor, ...publicResult } = result;
    void _actor;
    return NextResponse.json(publicResult, { headers: CORS });
  } catch (e: unknown) {
    if (
      typeof e === "object" && e !== null && "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return jsonError("Już odebrałeś ten kod", 409, CORS);
    }
    log.error("claim error", e);
    return jsonError("Błąd serwera", 500, CORS);
  }
}
