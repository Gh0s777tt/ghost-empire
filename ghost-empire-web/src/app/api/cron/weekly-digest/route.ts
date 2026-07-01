// src/app/api/cron/weekly-digest/route.ts
// Vercel Cron (Mondays 07:00 UTC, #773): email every portal OWNER a 7-day digest of their
// portal (new members, GT flow, top earner, pending orders/tickets). DORMANT without
// RESEND_API_KEY + EMAIL_FROM → { skipped: true }. Best-effort per tenant: one failing
// portal never blocks the rest. Auth: Vercel sets Authorization: Bearer ${CRON_SECRET}.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, displayNick } from "@/lib/utils";
import { emailConfigured, sendEmail } from "@/lib/email";
import { composeDigest } from "@/lib/digest";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron.weekly-digest");
const MAX_TENANTS = 25;

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailConfigured()) return NextResponse.json({ skipped: true, reason: "email not configured" });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const tenants = await prisma.tenant.findMany({
    where: { ownerUserId: { not: null } },
    select: { id: true, name: true, tokenSymbol: true, domain: true, slug: true, ownerUserId: true },
    take: MAX_TENANTS,
  });

  let sent = 0, skippedNoEmail = 0, failed = 0;
  for (const t of tenants) {
    try {
      const owner = t.ownerUserId
        ? await prisma.user.findUnique({ where: { id: t.ownerUserId }, select: { email: true } })
        : null;
      if (!owner?.email) { skippedNoEmail++; continue; }

      const scope = { tenantId: t.id };
      const [newUsers, flow, active, top, pendingOrders, openTickets] = await Promise.all([
        prisma.user.count({ where: { ...scope, createdAt: { gte: since } } }),
        prisma.$queryRaw<{ earned: number; spent: number }[]>`
          SELECT COALESCE(SUM(CASE WHEN tr."amount" > 0 THEN tr."amount" ELSE 0 END), 0)::int AS earned,
                 COALESCE(SUM(CASE WHEN tr."amount" < 0 THEN -tr."amount" ELSE 0 END), 0)::int AS spent
          FROM "transactions" tr JOIN "users" u ON u."id" = tr."userId"
          WHERE tr."createdAt" >= ${since} AND u."tenantId" = ${t.id}`,
        prisma.$queryRaw<{ n: number }[]>`
          SELECT COUNT(DISTINCT tr."userId")::int AS n
          FROM "transactions" tr JOIN "users" u ON u."id" = tr."userId"
          WHERE tr."createdAt" >= ${since} AND u."tenantId" = ${t.id}`,
        prisma.$queryRaw<{ name: string | null; username: string | null; amount: number }[]>`
          SELECT u."displayName" AS name, u."username" AS username, SUM(tr."amount")::int AS amount
          FROM "transactions" tr JOIN "users" u ON u."id" = tr."userId"
          WHERE tr."createdAt" >= ${since} AND tr."amount" > 0 AND u."tenantId" = ${t.id}
          GROUP BY u."id", u."displayName", u."username" ORDER BY 3 DESC LIMIT 1`,
        prisma.transaction.count({ where: { status: "pending", type: "spend", user: { tenantId: t.id } } }),
        prisma.supportTicket.count({ where: { ...scope, status: "open" } }).catch(() => 0),
      ]);

      const stats = {
        tenantName: t.name,
        tokenSymbol: t.tokenSymbol || "GT",
        portalUrl: t.domain ? `https://${t.domain}` : (process.env.NEXT_PUBLIC_SITE_URL || "https://ghost-empire-web.vercel.app"),
        newUsers,
        activeUsers: active[0]?.n ?? 0,
        gtEarned: flow[0]?.earned ?? 0,
        gtSpent: flow[0]?.spent ?? 0,
        topEarner: top[0] ? { name: displayNick(top[0].name, top[0].username) || "—", amount: top[0].amount } : null,
        pendingOrders,
        openTickets,
      };
      const { subject, html } = composeDigest(stats);
      if (await sendEmail({ to: owner.email, subject, html })) sent++;
      else failed++;
    } catch (e) {
      failed++;
      log.warn("digest failed for a tenant", { tenant: t.slug, error: e instanceof Error ? e.message : String(e) });
    }
  }

  log.info("weekly digest run", { tenants: tenants.length, sent, skippedNoEmail, failed });
  return NextResponse.json({ ok: true, tenants: tenants.length, sent, skippedNoEmail, failed });
}
