// Covers the co-op heist DB money path (escrow at join → one collective roll → crew-wide
// payout), which had NO integration coverage at all while wheel and duels did. The odds
// math lives in economy.ts and is unit-tested; what's tested here is the money: that the
// stake is really escrowed, that a win pays exactly WIN_MULT× it, that a bust keeps it,
// that a broke joiner is rejected without a partial charge — and, like wheel/duels since
// the "Kasyno na Żetonach" migration, that ALL of it moves `chips` and leaves the real GT
// economy (tokens + totalEarned/totalSpent) untouched, with every ledger row stamped CHIPS.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { heistJoin, resolveHeist } from "@/lib/heist";
import { HEIST_WIN_MULT } from "@/lib/economy";
import { MIN_BET } from "@/lib/gt-games";
import { resetDb, createUserWithChips, chipsOf, gtLedgerOf, GT_SEED } from "./helpers";

// resolveHeist() draws ONE collective outcome from cryptoRng and the success chance is
// only 30–60%, so against the real CSPRNG "the crew got paid" and "the crew busted" are
// both coin-flips — neither money path could be asserted without flake. Pin the source
// instead: 0 always clears the bar, 0.99 never does (the chance is capped at 0.6).
// Only cryptoRng is replaced; the rest of secure-rng stays real.
const rng = vi.hoisted(() => ({ value: 0 }));
vi.mock("@/lib/secure-rng", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/secure-rng")>()),
  cryptoRng: () => rng.value,
}));

const SUCCESS = 0;
const BUST = 0.99;

describe("heist (integration, real DB)", () => {
  beforeEach(resetDb);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const bet = MIN_BET;
  const start = bet * 5;
  const join = (userId: string, name: string, amount = bet) =>
    heistJoin({ platform: "twitch", userId, name, bet: amount });

  it("escrows every stake at join and pays the whole crew WIN_MULT× on a success", async () => {
    rng.value = SUCCESS;
    const a = await createUserWithChips(start);
    const b = await createUserWithChips(start);

    const opened = await join(a.id, "a");
    expect(opened.ok).toBe(true);
    expect(opened.heistId).toBeDefined();
    const heistId = String(opened.heistId);
    expect((await join(b.id, "b")).ok).toBe(true);

    // Escrow is charged at JOIN, before any roll — that's what makes the "broke at
    // resolve" race duels has to guard against impossible here.
    expect(await chipsOf(a.id)).toBe(start - bet);
    expect(await chipsOf(b.id)).toBe(start - bet);

    const msg = await resolveHeist(heistId);
    expect(msg).toContain("UDANY");

    // Each member nets +bet (paid 2× the stake they already put in), and the house
    // minted exactly crew × WIN_MULT × bet — not a chip more.
    const payout = bet * HEIST_WIN_MULT;
    expect(await chipsOf(a.id)).toBe(start - bet + payout);
    expect(await chipsOf(b.id)).toBe(start - bet + payout);
    expect((await chipsOf(a.id)) + (await chipsOf(b.id))).toBe(2 * (start - bet) + 2 * payout);

    const heist = await prisma.heist.findUnique({ where: { id: heistId } });
    expect(heist?.status).toBe("resolved");
    expect(heist?.success).toBe(true);

    // Chips moved; the real GT economy did not. Neither the escrow nor the payout may
    // touch `tokens`, `totalEarned` or `totalSpent` — that separation is what keeps the
    // casino free of the value loop, so it's asserted, not assumed.
    expect(await gtLedgerOf(a.id)).toEqual(GT_SEED);
    expect(await gtLedgerOf(b.id)).toEqual(GT_SEED);

    // One payout row per member, all CHIPS. Weekly ranking, wrapped and economy-health
    // count only `currency: "GT"`, so a mislabelled row would drag heist volume back
    // into real-economy metrics.
    const rows = await prisma.transaction.findMany({ where: { userId: { in: [a.id, b.id] } } });
    expect(rows).toHaveLength(2);
    expect(rows.every((t) => t.currency === "CHIPS")).toBe(true);
    expect(rows.every((t) => t.type === "earn" && t.reason === "heist:win" && t.amount === payout)).toBe(true);

    // resolveHeist() is idempotent (the bot's timer and the lazy recovery-on-join both
    // call it): a second run claims nothing, so the crew is not paid twice.
    expect(await resolveHeist(heistId)).toBeNull();
    expect(await chipsOf(a.id)).toBe(start - bet + payout);
    expect(await chipsOf(b.id)).toBe(start - bet + payout);
    expect(await prisma.transaction.count({ where: { userId: { in: [a.id, b.id] } } })).toBe(2);
    expect(await gtLedgerOf(a.id)).toEqual(GT_SEED);
  });

  it("keeps the escrowed stakes and pays nothing when the heist busts", async () => {
    rng.value = BUST;
    const a = await createUserWithChips(start);
    const b = await createUserWithChips(start);

    const opened = await join(a.id, "a");
    const heistId = String(opened.heistId);
    expect((await join(b.id, "b")).ok).toBe(true);

    const msg = await resolveHeist(heistId);
    expect(msg).toContain("WPADKA");

    // A bust is pure burn: the already-escrowed stakes are simply kept, so each member
    // sits at start - bet and nothing is credited back or elsewhere.
    expect(await chipsOf(a.id)).toBe(start - bet);
    expect(await chipsOf(b.id)).toBe(start - bet);

    const heist = await prisma.heist.findUnique({ where: { id: heistId } });
    expect(heist?.status).toBe("resolved");
    expect(heist?.success).toBe(false);

    expect(await gtLedgerOf(a.id)).toEqual(GT_SEED);
    expect(await gtLedgerOf(b.id)).toEqual(GT_SEED);

    // The escrow charge writes no ledger row (only the win payout does), so a busted
    // heist must leave the Transaction table completely empty — asserting the count is
    // strictly stronger here than "every row is CHIPS", which would hold vacuously.
    const rows = await prisma.transaction.findMany({ where: { userId: { in: [a.id, b.id] } } });
    expect(rows).toHaveLength(0);
  });

  it("rejects opening a heist the user can't afford — no charge, no heist, no ledger row", async () => {
    const poor = await createUserWithChips(bet - 1);

    const r = await join(poor.id, "poor");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("za mało żetonów");

    expect(await chipsOf(poor.id)).toBe(bet - 1); // untouched, not partially charged
    expect(await prisma.heist.count()).toBe(0); // the whole opening transaction rolled back
    expect(await prisma.heistEntry.count()).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: poor.id } })).toBe(0);
    expect(await gtLedgerOf(poor.id)).toEqual(GT_SEED);
  });

  it("rejects joining an open heist while broke — the crew and the opener's escrow stand", async () => {
    const a = await createUserWithChips(start);
    const poor = await createUserWithChips(bet - 1);

    const opened = await join(a.id, "a");
    const heistId = String(opened.heistId);

    const r = await join(poor.id, "poor");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("za mało żetonów");

    // The rejected join must not charge the joiner, enrol them, or disturb the crew
    // that's already escrowed — a partial charge here would be an unrecoverable loss,
    // since a heist entry is the only thing a payout is ever computed from.
    expect(await chipsOf(poor.id)).toBe(bet - 1);
    expect(await chipsOf(a.id)).toBe(start - bet);
    expect(await prisma.heistEntry.count({ where: { heistId } })).toBe(1);
    expect(await prisma.transaction.count({ where: { userId: { in: [a.id, poor.id] } } })).toBe(0);
    expect(await gtLedgerOf(poor.id)).toEqual(GT_SEED);
    expect(await gtLedgerOf(a.id)).toEqual(GT_SEED);
  });
});
