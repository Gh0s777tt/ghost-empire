// src/lib/heist.ts
// Co-op heist orchestration. Stakes are ESCROWED at join (atomic per-join charge), so the
// "broke at resolve" race that duels guard against can't happen here. Resolution rolls one
// collective outcome (odds scale with crew size) and, on success, pays every member
// WIN_MULT× their stake — all in one transaction. resolveHeist() is idempotent (no-op once
// resolved), so the bot's timer and the lazy recovery-on-join can both call it safely.
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { heistSuccessChance, rollHeist, HEIST_WIN_MULT, HEIST_MAX_CREW } from "@/lib/economy";
import { MIN_BET, MAX_BET } from "@/lib/gt-games";
import { createLogger } from "@/lib/logger";

const log = createLogger("heist");

/** Join window — how long the crew has to assemble before the heist resolves. */
export const HEIST_TTL_MS = 90_000;

const cryptoRng = () => randomInt(0, 1_000_000) / 1_000_000;
const fmt = (n: number) => n.toLocaleString("pl-PL");

export type HeistJoinResult = { ok: boolean; message: string; resolveInMs?: number; heistId?: string };

class HeistError extends Error {}

/**
 * Resolve a heist by id atomically. Idempotent: returns null if it's already resolved or
 * gone (so the timer + lazy recovery can race harmlessly). On success pays each member
 * WIN_MULT× their (already-escrowed) stake; on failure the escrowed stakes are simply kept.
 */
export async function resolveHeist(heistId: string): Promise<string | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Atomically CLAIM the heist (open → resolving) BEFORE paying — the row-locked
      // updateMany means a concurrent resolve (the bot's timer racing the lazy
      // recovery-on-join) sees count 0 and bails, instead of both running the payout
      // loop and double-crediting the crew. #audit-v2 (mirrors predictions/duels claims)
      const claim = await tx.heist.updateMany({ where: { id: heistId, status: "open" }, data: { status: "resolving" } });
      if (claim.count === 0) return null; // already resolved / claimed by a concurrent call
      const heist = await tx.heist.findUnique({ where: { id: heistId }, include: { entries: true } });
      if (!heist) return null;

      const crew = heist.entries.length;
      const success = rollHeist(crew, cryptoRng);

      if (success) {
        let totalPayout = 0;
        for (const e of heist.entries) {
          const payout = e.bet * HEIST_WIN_MULT;
          totalPayout += payout;
          await tx.user.update({
            where: { id: e.userId },
            data: { tokens: { increment: payout }, totalEarned: { increment: payout } },
          });
          await tx.transaction.create({
            data: { userId: e.userId, type: "earn", amount: payout, reason: "heist:win", status: "completed" },
          });
        }
        await tx.heist.update({ where: { id: heist.id }, data: { status: "resolved", success: true, resolvedAt: new Date() } });
        return `🏦 NAPAD ekipy ${crew} → ✅ UDANY! Łup ${fmt(totalPayout)} GT — każdy bierze ${HEIST_WIN_MULT}× stawki! 💰`;
      }

      const totalLost = heist.entries.reduce((s, e) => s + e.bet, 0);
      await tx.heist.update({ where: { id: heist.id }, data: { status: "resolved", success: false, resolvedAt: new Date() } });
      return `🚨 NAPAD ekipy ${crew} → ❌ WPADKA! Straż was złapała — ekipa traci ${fmt(totalLost)} GT. 🚔`;
    });
  } catch (e) {
    log.error("resolveHeist failed", e, { heistId });
    return null;
  }
}

/** Start a new heist or join the active one on a platform. Charges (escrows) the stake. */
export async function heistJoin(opts: { platform: string; userId: string; name: string; bet: number }): Promise<HeistJoinResult> {
  const { platform, userId, name, bet } = opts;
  if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
    return { ok: false, message: `@${name} stawka musi być ${fmt(MIN_BET)}-${fmt(MAX_BET)} GT.` };
  }
  try {
    const now = new Date();
    let prefix = "";

    // Scope the heist pool to the joiner's own portal — a same-platform sub-tenant must never
    // join (or recover) another portal's crew (the heist stores its opener's tenant).
    const joiner = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
    const tenantId = joiner?.tenantId ?? null;

    // Recovery: resolve an expired-but-still-open heist first (e.g. a bot restart dropped
    // its timer). Its result is prepended to this message so nothing is silently stuck.
    const expired = await prisma.heist.findFirst({
      where: { platform, tenantId, status: "open", resolvesAt: { lte: now } },
      select: { id: true },
    });
    if (expired) {
      const r = await resolveHeist(expired.id);
      if (r) prefix = r + " — ";
    }

    // Active (open, not yet expired) heist to join?
    const active = await prisma.heist.findFirst({
      where: { platform, tenantId, status: "open", resolvesAt: { gt: now } },
      include: { entries: { select: { userId: true } } },
    });

    if (active) {
      if (active.entries.some((e) => e.userId === userId)) {
        return { ok: false, message: `${prefix}@${name} już jesteś w ekipie tego napadu. 🦝` };
      }
      if (active.entries.length >= HEIST_MAX_CREW) {
        return { ok: false, message: `${prefix}@${name} ekipa pełna (${HEIST_MAX_CREW}). Poczekaj na następny napad.` };
      }
      const crew = await prisma.$transaction(async (tx) => {
        const charged = await tx.user.updateMany({
          where: { id: userId, tokens: { gte: bet } },
          data: { tokens: { decrement: bet }, totalSpent: { increment: bet } },
        });
        if (charged.count === 0) throw new HeistError("broke");
        const stillOpen = await tx.heist.findFirst({ where: { id: active.id, status: "open", resolvesAt: { gt: now } }, select: { id: true } });
        if (!stillOpen) throw new HeistError("closed");
        await tx.heistEntry.create({ data: { heistId: active.id, userId, name, bet } });
        return tx.heistEntry.count({ where: { heistId: active.id } });
      });
      const chance = Math.round(heistSuccessChance(crew) * 100);
      return { ok: true, message: `${prefix}🦝 @${name} dołącza do napadu! Ekipa: ${crew} (szansa ${chance}%). Wpisz !heist <stawka>!` };
    }

    // No active heist → open a new one with this user as the first crew member.
    const heistId = await prisma.$transaction(async (tx) => {
      const charged = await tx.user.updateMany({
        where: { id: userId, tokens: { gte: bet } },
        data: { tokens: { decrement: bet }, totalSpent: { increment: bet } },
      });
      if (charged.count === 0) throw new HeistError("broke");
      const heist = await tx.heist.create({
        data: { platform, tenantId, status: "open", startedById: userId, resolvesAt: new Date(now.getTime() + HEIST_TTL_MS) },
      });
      await tx.heistEntry.create({ data: { heistId: heist.id, userId, name, bet } });
      return heist.id;
    });
    return {
      ok: true,
      message: `${prefix}🏦 @${name} planuje NAPAD na skarbiec! Wpisz !heist <stawka> w ${Math.round(HEIST_TTL_MS / 1000)}s, by dołączyć — im większa ekipa, tym większa szansa! 🦝`,
      resolveInMs: HEIST_TTL_MS,
      heistId,
    };
  } catch (e) {
    if (e instanceof HeistError) {
      if (e.message === "broke") return { ok: false, message: `@${name} masz za mało GT na taką stawkę (${fmt(bet)}).` };
      if (e.message === "closed") return { ok: false, message: `@${name} napad właśnie się zamknął — poczekaj na następny.` };
    }
    log.error("heistJoin failed", e, { userId });
    return { ok: false, message: `@${name} coś poszło nie tak — spróbuj ponownie.` };
  }
}
