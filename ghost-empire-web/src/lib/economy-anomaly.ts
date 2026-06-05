// src/lib/economy-anomaly.ts
// Anti-abuse: flag unusual admin token grants (a single huge grant, or a spike in
// cumulative grants per hour) and notify every admin. Fire-and-forget — never blocks
// or breaks the grant itself.
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("economy.anomaly");

const SINGLE_GRANT_THRESHOLD = 100_000; // one grant ≥ this is worth a look
const HOURLY_GRANT_THRESHOLD = 500_000; // cumulative admin_grant in the rolling hour
const WINDOW_MS = 60 * 60 * 1000;

export async function checkGrantAnomaly(opts: {
  adminId: string;
  amount: number;
  targetUsername: string | null;
}): Promise<void> {
  try {
    if (opts.amount <= 0) return; // only positive grants are flagged

    const reasons: string[] = [];
    if (opts.amount >= SINGLE_GRANT_THRESHOLD) {
      reasons.push(`pojedynczy grant ${opts.amount.toLocaleString("pl-PL")} GT`);
    }

    const since = new Date(Date.now() - WINDOW_MS);
    const agg = await prisma.transaction.aggregate({
      where: { type: "admin_grant", amount: { gt: 0 }, createdAt: { gte: since } },
      _sum: { amount: true },
    });
    const hourly = agg._sum.amount ?? 0;
    if (hourly >= HOURLY_GRANT_THRESHOLD) {
      reasons.push(`${hourly.toLocaleString("pl-PL")} GT przyznane w ostatniej godzinie`);
    }

    if (reasons.length === 0) return;

    const summary = reasons.join(" · ");
    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "system",
          title: "🚨 Anomalia ekonomii",
          message: `Nietypowy poziom grantów: ${summary}. Cel: ${opts.targetUsername ?? "?"}. Sprawdź audit log.`,
          icon: "🚨",
          link: "/admin#audit",
        })),
      });
    }
    log.warn("economy anomaly detected", { summary, adminId: opts.adminId, target: opts.targetUsername });
  } catch (e) {
    log.error("anomaly check failed", e);
  }
}
