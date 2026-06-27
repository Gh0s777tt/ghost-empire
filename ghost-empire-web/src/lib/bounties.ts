// src/lib/bounties.ts
// Viewer Bounties (#679): viewers pool GT behind a challenge for the streamer. Pledges
// ESCROW GT (atomic conditional decrement). The streamer resolves: "completed" keeps the
// pool (burned — a GT sink, viewers got the action they paid for) or "rejected" refunds
// every pledge. All token movement runs inside one $transaction (mirrors predictions) so
// partial state on errors is impossible; the bounty row is locked FOR UPDATE so concurrent
// pledge/resolve serialize and can't double-spend or double-refund.
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { createLogger } from "@/lib/logger";

const log = createLogger("bounties");

export const MIN_PLEDGE = 50;
export const MAX_PLEDGE = 1_000_000;
export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const MAX_OPEN_PER_USER = 3;
export const MAX_OPEN_PER_PORTAL = 40;
export const MAX_EXPIRY_HOURS = 720; // 30 days

type Result<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };

/** Pure validation of a pledge amount (no I/O — unit-tested). */
export function validatePledge(amount: unknown): { ok: true; amount: number } | { ok: false; error: string } {
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < MIN_PLEDGE || amount > MAX_PLEDGE) {
    return { ok: false, error: `Zastaw musi być ${MIN_PLEDGE.toLocaleString("pl-PL")}–${MAX_PLEDGE.toLocaleString("pl-PL")} GT` };
  }
  return { ok: true, amount };
}

/** Pure validation + normalization of a bounty title (no I/O — unit-tested). */
export function validateTitle(title: unknown): { ok: true; title: string } | { ok: false; error: string } {
  if (typeof title !== "string") return { ok: false, error: "Brak tytułu" };
  const t = title.trim();
  if (t.length < TITLE_MIN || t.length > TITLE_MAX) {
    return { ok: false, error: `Wyzwanie musi mieć ${TITLE_MIN}–${TITLE_MAX} znaków` };
  }
  return { ok: true, title: t };
}

/** Pure validation of an optional expiry in hours-from-now. undefined/null/0 = no expiry. */
export function validateExpiry(hours: unknown): { ok: true; hours: number | null } | { ok: false; error: string } {
  if (hours === undefined || hours === null || hours === 0) return { ok: true, hours: null };
  if (typeof hours !== "number" || !Number.isInteger(hours) || hours < 1 || hours > MAX_EXPIRY_HOURS) {
    return { ok: false, error: `Czas wygaśnięcia: 1–${MAX_EXPIRY_HOURS} h lub brak` };
  }
  return { ok: true, hours };
}

export type CreateResult = Result<{ bountyId: string; newBalance: number }>;

export async function createBounty(opts: {
  userId: string;
  title: string;
  description?: string | null;
  initialPledge: number;
  expiresInHours?: number | null;
}): Promise<CreateResult> {
  const vt = validateTitle(opts.title);
  if (!vt.ok) return { ok: false, status: 400, error: vt.error };
  const vp = validatePledge(opts.initialPledge);
  if (!vp.ok) return { ok: false, status: 400, error: vp.error };
  const ve = validateExpiry(opts.expiresInHours);
  if (!ve.ok) return { ok: false, status: 400, error: ve.error };
  const expiresAt = ve.hours ? new Date(Date.now() + ve.hours * 3_600_000) : null;
  const desc = typeof opts.description === "string" ? opts.description.trim().slice(0, 500) || null : null;

  const tid = await currentTenantId();
  try {
    return await prisma.$transaction(async (tx) => {
      const [mine, portal] = await Promise.all([
        tx.bounty.count({ where: { creatorId: opts.userId, status: "open", ...(tid ? { tenantId: tid } : {}) } }),
        tx.bounty.count({ where: { status: "open", ...(tid ? { tenantId: tid } : {}) } }),
      ]);
      if (mine >= MAX_OPEN_PER_USER) return { ok: false, status: 409, error: `Masz już ${MAX_OPEN_PER_USER} otwarte bounty` } as const;
      if (portal >= MAX_OPEN_PER_PORTAL) return { ok: false, status: 409, error: "Za dużo otwartych bounty na portalu" } as const;

      const charged = await tx.user.updateMany({
        where: { id: opts.userId, tokens: { gte: vp.amount } },
        data: { tokens: { decrement: vp.amount } },
      });
      if (charged.count === 0) return { ok: false, status: 402, error: "Za mało Ghost Tokens" } as const;

      const bounty = await tx.bounty.create({
        data: { tenantId: tid, creatorId: opts.userId, title: vt.title, description: desc, pooledGt: vp.amount, status: "open", expiresAt },
        select: { id: true },
      });
      await tx.bountyPledge.create({ data: { bountyId: bounty.id, userId: opts.userId, amount: vp.amount } });
      await tx.transaction.create({
        data: { userId: opts.userId, type: "spend", amount: -vp.amount, reason: `bounty_pledge:${bounty.id}`, status: "completed" },
      });
      const fresh = await tx.user.findUnique({ where: { id: opts.userId }, select: { tokens: true } });
      return { ok: true, bountyId: bounty.id, newBalance: fresh?.tokens ?? 0 } as const;
    });
  } catch (e) {
    log.error("createBounty failed", e);
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}

export type PledgeResult = Result<{ newBalance: number; pooledGt: number }>;

export async function pledgeToBounty(opts: { userId: string; bountyId: string; amount: number }): Promise<PledgeResult> {
  const vp = validatePledge(opts.amount);
  if (!vp.ok) return { ok: false, status: 400, error: vp.error };
  const tid = await currentTenantId();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "bounties" WHERE id = ${opts.bountyId} FOR UPDATE`;
      const b = await tx.bounty.findFirst({ where: { id: opts.bountyId, ...(tid ? { tenantId: tid } : {}) } });
      if (!b) return { ok: false, status: 404, error: "Bounty nie istnieje" } as const;
      if (b.status !== "open") return { ok: false, status: 409, error: "Bounty jest zamknięte" } as const;

      const charged = await tx.user.updateMany({
        where: { id: opts.userId, tokens: { gte: vp.amount } },
        data: { tokens: { decrement: vp.amount } },
      });
      if (charged.count === 0) return { ok: false, status: 402, error: "Za mało Ghost Tokens" } as const;

      await tx.bountyPledge.create({ data: { bountyId: b.id, userId: opts.userId, amount: vp.amount } });
      const updated = await tx.bounty.update({ where: { id: b.id }, data: { pooledGt: { increment: vp.amount } }, select: { pooledGt: true } });
      await tx.transaction.create({
        data: { userId: opts.userId, type: "spend", amount: -vp.amount, reason: `bounty_pledge:${b.id}`, status: "completed" },
      });
      const fresh = await tx.user.findUnique({ where: { id: opts.userId }, select: { tokens: true } });
      return { ok: true, newBalance: fresh?.tokens ?? 0, pooledGt: updated.pooledGt } as const;
    });
  } catch (e) {
    log.error("pledgeToBounty failed", e);
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}

export type ResolveResult = Result<{ outcome: "completed" | "rejected" | "expired"; refunded: number; burned: number }>;

/** Resolve a bounty: "completed" keeps (burns) the pool; "rejected"/"expired" refund all pledges.
 *  Request paths derive the tenant from the host; the expiry cron passes tenantId:null to
 *  operate across ALL portals (it already selected the due rows globally). */
export async function resolveBounty(opts: { bountyId: string; outcome: "completed" | "rejected" | "expired"; tenantId?: string | null }): Promise<ResolveResult> {
  if (opts.outcome !== "completed" && opts.outcome !== "rejected" && opts.outcome !== "expired") {
    return { ok: false, status: 400, error: "outcome: completed | rejected | expired" };
  }
  const tid = opts.tenantId !== undefined ? opts.tenantId : await currentTenantId();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "bounties" WHERE id = ${opts.bountyId} FOR UPDATE`;
      const b = await tx.bounty.findFirst({ where: { id: opts.bountyId, ...(tid ? { tenantId: tid } : {}) }, include: { pledges: true } });
      if (!b) return { ok: false, status: 404, error: "Nie znaleziono" } as const;
      if (b.status !== "open") return { ok: false, status: 409, error: "Już rozstrzygnięte" } as const;

      const claim = await tx.bounty.updateMany({
        where: { id: b.id, status: "open", ...(tid ? { tenantId: tid } : {}) },
        data: { status: opts.outcome, resolvedAt: new Date() },
      });
      if (claim.count === 0) return { ok: false, status: 409, error: "Już rozstrzygnięte" } as const;

      const byUser = new Map<string, number>();
      for (const pl of b.pledges) byUser.set(pl.userId, (byUser.get(pl.userId) ?? 0) + pl.amount);

      if (opts.outcome !== "completed") {
        // "rejected" (streamer declines) and "expired" (deadline passed) both refund in full.
        const title = opts.outcome === "expired" ? "Bounty wygasło — zwrot GT" : "Bounty odrzucone — zwrot GT";
        for (const [userId, amount] of byUser) {
          await tx.user.update({ where: { id: userId }, data: { tokens: { increment: amount }, totalEarned: { increment: amount } } });
          await tx.transaction.create({ data: { userId, type: "earn", amount, reason: `bounty_refund:${b.id}`, status: "completed" } });
          await tx.notification.create({
            data: { userId, type: "system", title, message: `Zwrócono ${amount.toLocaleString("pl-PL")} GT za „${b.title.slice(0, 60)}".`, icon: "↩️", link: "/bounties" },
          });
        }
        return { ok: true, outcome: opts.outcome, refunded: byUser.size, burned: 0 } as const;
      }

      for (const [userId] of byUser) {
        await tx.notification.create({
          data: { userId, type: "system", title: "🎯 Bounty wykonane!", message: `Streamer wykonał „${b.title.slice(0, 60)}". Dzięki za wsparcie!`, icon: "🎯", link: "/bounties" },
        });
      }
      return { ok: true, outcome: "completed", refunded: 0, burned: b.pooledGt } as const;
    });
  } catch (e) {
    log.error("resolveBounty failed", e);
    return { ok: false, status: 500, error: "Błąd serwera" };
  }
}

/**
 * Backstop run from the daily prune cron (currentTenantId() is null there → all portals):
 * every open bounty whose `expiresAt` has passed is resolved "expired" (full refund). Each
 * bounty resolves in its own atomic transaction; one failure doesn't abort the rest.
 */
export async function expireBounties(): Promise<{ expired: number; refunded: number }> {
  const now = new Date();
  const due = await prisma.bounty.findMany({
    where: { status: "open", expiresAt: { not: null, lte: now } },
    select: { id: true },
    take: 500,
  });
  let expired = 0;
  let refunded = 0;
  for (const b of due) {
    try {
      // tenantId:null → resolve by id across all portals (cron has no portal context).
      const r = await resolveBounty({ bountyId: b.id, outcome: "expired", tenantId: null });
      if (r.ok) { expired++; refunded += r.refunded; }
    } catch (e) {
      log.error(`expireBounties: failed for ${b.id}`, e);
    }
  }
  if (expired) log.info("expired bounties", { expired, refunded });
  return { expired, refunded };
}
