// src/app/api/referral/route.ts
// GET  = my shareable code + how many I've referred + whether I've claimed one.
// POST = claim a friend's code (once): both of us get REFERRAL_REWARD GT, atomically.
// Tenant-scoped (the referrer must belong to the same portal). One claim per user.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { REFERRAL_REWARD, generateReferralCode, normalizeReferralCode, isValidReferralCode } from "@/lib/referrals";

const log = createLogger("referral");

export const dynamic = "force-dynamic";

class ReferralError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Lazily mint a unique code for the user; retry on the rare unique collision. */
async function ensureCode(userId: string, current: string | null): Promise<string> {
  if (current) return current;
  for (let i = 0; i < 6; i++) {
    const candidate = generateReferralCode();
    try {
      await prisma.user.update({ where: { id: userId }, data: { referralCode: candidate } });
      return candidate;
    } catch { /* unique collision — try another */ }
  }
  throw new ReferralError("Nie udało się wygenerować kodu", 500);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true, referredById: true } });
  const [code, referralCount] = await Promise.all([
    ensureCode(userId, me?.referralCode ?? null),
    prisma.user.count({ where: { referredById: userId } }),
  ]);

  return NextResponse.json({ code, reward: REFERRAL_REWARD, referralCount, claimed: me?.referredById != null });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;

  const rl = await rateLimit(`referral:${userId}`, 10, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  let body: { code?: string };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }
  const code = normalizeReferralCode(body.code ?? "");
  if (!isValidReferralCode(code)) return jsonError("Nieprawidłowy kod", 400);

  const tid = await currentTenantId();
  try {
    await prisma.$transaction(async (tx) => {
      const me = await tx.user.findUnique({ where: { id: userId }, select: { referredById: true, referralCode: true } });
      if (me?.referredById) throw new ReferralError("Już wykorzystałeś polecenie", 409);
      if (me?.referralCode === code) throw new ReferralError("Nie możesz użyć własnego kodu", 400);

      const referrer = await tx.user.findFirst({
        where: { referralCode: code, ...(tid ? { tenantId: tid } : {}) },
        select: { id: true },
      });
      if (!referrer || referrer.id === userId) throw new ReferralError("Kod nie istnieje", 404);

      // Atomic one-time guard: only the first claim flips referredById from null.
      const claimed = await tx.user.updateMany({
        where: { id: userId, referredById: null },
        data: { referredById: referrer.id, tokens: { increment: REFERRAL_REWARD }, totalEarned: { increment: REFERRAL_REWARD } },
      });
      if (claimed.count === 0) throw new ReferralError("Już wykorzystałeś polecenie", 409);

      await tx.user.update({ where: { id: referrer.id }, data: { tokens: { increment: REFERRAL_REWARD }, totalEarned: { increment: REFERRAL_REWARD } } });
      await tx.transaction.create({ data: { userId, type: "earn", amount: REFERRAL_REWARD, reason: "referral_claim", status: "completed" } });
      await tx.transaction.create({ data: { userId: referrer.id, type: "earn", amount: REFERRAL_REWARD, reason: "referral_bonus", status: "completed" } });
      await tx.notification.create({ data: { userId: referrer.id, type: "system", title: "🎉 Ktoś użył Twojego kodu!", message: `+${REFERRAL_REWARD} GT za polecenie znajomego.`, icon: "🎉", link: "/profile" } });
    });
    const fresh = await prisma.user.findUnique({ where: { id: userId }, select: { tokens: true } });
    return NextResponse.json({ ok: true, reward: REFERRAL_REWARD, newBalance: fresh?.tokens ?? 0 });
  } catch (e) {
    if (e instanceof ReferralError) return jsonError(e.message, e.status);
    log.error("referral claim error", e);
    return jsonError("Błąd serwera", 500);
  }
}
