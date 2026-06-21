// src/app/api/profile/export/route.ts
// GDPR data export (#audit3 — Art. 15 access + Art. 20 portability): a logged-in viewer
// downloads ALL personal data tied to THEIR account as a JSON file. Strictly scoped to
// session.user.id — never anyone else's data. Secret material (TOTP secret, passkey keys,
// OAuth tokens) is never included (lib/data-export redacts it); shipping PII is decrypted
// for the owner only. Pairs with the encrypted shipping profile (#609) + erasure (DELETE).
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { decryptSecret } from "@/lib/crypto";
import { buildUserExport, exportFilename } from "@/lib/data-export";

export const dynamic = "force-dynamic";

// Cap the GT ledger so an export can't pull an unbounded table; flag if we trimmed it.
const MAX_LEDGER = 5000;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;

  // Heavier than a typical profile call (many tables) — cap it tightly per user.
  const rl = await rateLimit(`export:${userId}`, 5, 300_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za kilka minut.", 429);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return jsonError("Nie znaleziono konta", 404);

  // Sequential reads: the free-tier pool is tiny (max 3) and an export is rare / not
  // latency-critical, so we avoid a fan-out that would just queue anyway.
  const shipping = await prisma.shippingProfile.findUnique({ where: { userId } });
  const socialLinks = await prisma.socialLink.findMany({ where: { userId }, orderBy: { platform: "asc" } });
  const txRows = await prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: MAX_LEDGER + 1 });
  const achievements = await prisma.userAchievement.findMany({
    where: { userId },
    include: { achievement: { select: { code: true, name: true, rarity: true } } },
    orderBy: { earnedAt: "desc" },
  });
  const collectibles = await prisma.userCollectible.findMany({
    where: { userId },
    include: { collectible: { select: { name: true, rarity: true } } },
    orderBy: { acquiredAt: "desc" },
  });
  const follows = await prisma.portalFollow.findMany({
    where: { userId },
    include: { tenant: { select: { slug: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const companion = await prisma.companion.findUnique({ where: { userId } });
  const passkeyCount = await prisma.passkey.count({ where: { userId } });
  const pushSubscriptionCount = await prisma.pushSubscription.count({ where: { userId } });

  const truncated = txRows.length > MAX_LEDGER;
  const transactions = truncated ? txRows.slice(0, MAX_LEDGER) : txRows;

  const generatedAt = new Date().toISOString();
  const exportObj = buildUserExport({
    user,
    shipping: shipping
      ? {
          fullName: decryptSecret(shipping.fullName),
          phone: decryptSecret(shipping.phone),
          email: decryptSecret(shipping.email),
          addressLine: decryptSecret(shipping.addressLine),
          city: decryptSecret(shipping.city),
          postalCode: decryptSecret(shipping.postalCode),
          country: shipping.country ?? null,
          parcelLocker: decryptSecret(shipping.parcelLocker),
          consentAt: shipping.consentAt?.toISOString() ?? null,
        }
      : null,
    socialLinks: socialLinks.map((s) => ({ platform: s.platform, handle: s.handle, url: s.url, clicks: s.clicks })),
    transactions: transactions.map((t) => ({ type: t.type, amount: t.amount, reason: t.reason, status: t.status, createdAt: t.createdAt })),
    transactionsTruncated: truncated,
    achievements: achievements.map((a) => ({ code: a.achievement.code, name: a.achievement.name, rarity: a.achievement.rarity, earnedAt: a.earnedAt })),
    collectibles: collectibles.map((c) => ({ name: c.collectible.name, rarity: c.collectible.rarity, qty: c.qty, acquiredAt: c.acquiredAt })),
    follows: follows.map((f) => ({ tenant: f.tenant?.name || f.tenant?.slug || f.tenantId, since: f.createdAt })),
    companion: companion ? { name: companion.name, xp: companion.xp } : null,
    passkeyCount,
    pushSubscriptionCount,
    generatedAt,
  });

  return new Response(JSON.stringify(exportObj, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(user.username, generatedAt)}"`,
      "Cache-Control": "no-store",
    },
  });
}
