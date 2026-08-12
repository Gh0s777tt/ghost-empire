// src/lib/economy-anomaly.ts
// Anti-abuse: flag unusual admin token grants (a single huge grant, or a spike in
// cumulative grants per hour) and notify the admins OF THAT PORTAL. Fire-and-forget —
// never blocks or breaks the grant itself. Everything here is per-tenant: the window it
// measures and the audience it alerts (see checkGrantAnomaly).
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("economy.anomaly");

export const SINGLE_GRANT_THRESHOLD = 100_000; // one grant ≥ this is worth a look
export const HOURLY_GRANT_THRESHOLD = 500_000; // cumulative admin_grant in the rolling hour
const WINDOW_MS = 60 * 60 * 1000;

/**
 * Pure anomaly decision — which flags fire for a grant of `amount` given the
 * rolling-hour `hourlyTotal` of admin grants. Extracted from checkGrantAnomaly so
 * the thresholds/messages are unit-testable without a DB (repo convention: pure
 * logic gets unit tests). Empty array = nothing anomalous.
 */
export function anomalyReasons(amount: number, hourlyTotal: number): string[] {
  const reasons: string[] = [];
  if (amount >= SINGLE_GRANT_THRESHOLD) {
    reasons.push(`pojedynczy grant ${amount.toLocaleString("pl-PL")} GT`);
  }
  if (hourlyTotal >= HOURLY_GRANT_THRESHOLD) {
    reasons.push(`${hourlyTotal.toLocaleString("pl-PL")} GT przyznane w ostatniej godzinie`);
  }
  return reasons;
}

/**
 * Flag an admin grant that looks abusive and notify that portal's admins. Fire-and-forget:
 * it swallows its own errors so a failed check can never break (or roll back) the grant.
 *
 * @param opts.adminId - Admin who issued the grant (logged, not notified separately).
 * @param opts.amount - Signed grant amount; anything ≤ 0 returns immediately (deductions
 *   can't inflate the economy).
 * @param opts.targetUsername - Recipient, quoted in the alert so admins can jump to the
 *   audit log.
 * @param opts.tenantId - Portal the grant happened on (the caller's `auth.tenantId`). Scopes
 *   BOTH the rolling-hour window and the admin audience; `null` = legacy/single-tenant.
 *
 * @remarks
 * **Real GT only.** Callers must not invoke this for `CHIPS` grants, and the rolling-hour
 * aggregate below filters `currency: "GT"` — chips are the free, value-less casino currency,
 * so a legitimate chips giveaway would otherwise trip a "someone is minting GT" alarm and,
 * worse, desensitise the alarm that actually matters. Same GT-only rule as the weekly ranking
 * and the economy-health dashboard (docs/CHIPS-CASINO.md, Faza 8).
 *
 * **Per-portal only.** Both DB reads are tenant-scoped — see the comment on the aggregate.
 */
export async function checkGrantAnomaly(opts: {
  adminId: string;
  amount: number;
  targetUsername: string | null;
  tenantId: string | null;
}): Promise<void> {
  try {
    if (opts.amount <= 0) return; // only positive grants are flagged

    const since = new Date(Date.now() - WINDOW_MS);
    // Tenant-scope the rolling-hour window: an unscoped aggregate here blends every portal's
    // grants, so portal A's activity pushes portal B over HOURLY_GRANT_THRESHOLD (false alarms
    // desensitise the one alarm that matters) while an abusive admin on a small portal hides in
    // platform-wide noise. Same reasoning — and the same idiom — as the achievements/weekly
    // aggregates in src/lib/cached.ts:70,112-119: `Transaction` has no tenantId column, so the
    // only scope is the `user` relation. `tenantId` null = legacy/single-tenant → no isolation
    // boundary to enforce (repo-wide `...(tid ? {…} : {})` convention).
    const tid = opts.tenantId;
    const agg = await prisma.transaction.aggregate({
      // `currency: "GT"` is safe for legacy rows: the column is non-nullable with a "GT"
      // default, so everything written before the chips split already reads as GT.
      where: {
        type: "admin_grant", currency: "GT", amount: { gt: 0 }, createdAt: { gte: since },
        ...(tid ? { user: { tenantId: tid } } : {}),
      },
      _sum: { amount: true },
    });
    const hourly = agg._sum.amount ?? 0;

    const reasons = anomalyReasons(opts.amount, hourly);
    if (reasons.length === 0) return;

    const summary = reasons.join(" · ");
    // …and scope the audience the same way: the message below quotes the RECIPIENT'S username,
    // and GET /api/notifications filters by userId alone, so an unscoped `isAdmin` fan-out really
    // does show a foreign portal's admin the nick of this portal's viewer — a cross-tenant leak,
    // on top of the alert being none of their business.
    const admins = await prisma.user.findMany({
      where: { isAdmin: true, ...(tid ? { tenantId: tid } : {}) },
      select: { id: true },
    });
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
    // `tenantId` in the context so a platform-wide log stream still says WHICH portal fired.
    log.warn("economy anomaly detected", { summary, adminId: opts.adminId, target: opts.targetUsername, tenantId: tid ?? null });
  } catch (e) {
    log.error("anomaly check failed", e);
  }
}
