// Covers the DB money path of `playGtGame` — the shared engine behind SEVEN casino games
// (slots, coinflip, roulette, dice, crash, plinko, scratch). The odds/multiplier math is
// unit-tested in gt-games.test.ts; what's tested here is the money: that the bet is really
// charged, that a win credits exactly the payout, that a broke player is rejected without a
// partial charge — and, like wheel/duels/heist since the "Kasyno na Żetonach" migration, that
// ALL of it moves `chips` and leaves the real GT economy (tokens + totalEarned/totalSpent)
// untouched, with every ledger row stamped CHIPS.
//
// NOT covered here, deliberately: blackjack / mines / hi-lo. Those keep their session state in
// Redis and bail with a 503 (`if (!redis) ...`) before touching money, so against this harness
// (no Redis) they can't reach their money path at all — covering them needs a Redis service in
// the integration setup, not a test. The jackpot is Redis-backed too, but degrades cleanly:
// `redis` is null → feedJackpot() no-ops and claimJackpot() returns the seed.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { playGtGame, MIN_BET, MAX_BET } from "@/lib/gt-games";
import { resetDb, createUserWithChips, chipsOf, gtLedgerOf, GT_SEED } from "./helpers";

// `playGtGame` grants casino achievements through next/server's `after()` AFTER the money
// transaction has committed, and outside a request scope — a script, a cron tick, this test —
// `after()` throws. It used to throw from INSIDE the money try/catch, so a fully paid play came
// back as `{ ok: false, status: 500 }` (and on a jackpot spin the catch also returned the
// already-paid-out surplus to the pool). `safeAfter()` absorbs that now, so this suite runs
// against the REAL, throwing `after()` rather than stubbing it to a no-op: every case below is
// therefore also a check that a failing post-commit hook leaves the money result alone.
// `afterThrows` forces the failure explicitly in the regression case, so the guard stays covered
// even if Next ever turns an out-of-scope `after()` into a warning.
const afterThrows = vi.hoisted(() => ({ value: false }));
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return {
    ...real,
    after: (task: Parameters<typeof real.after>[0]) => {
      if (afterThrows.value) throw new Error("after() was called outside a request scope");
      return real.after(task);
    },
  };
});

// Coinflip wins on `rng() < 0.48`, so against the real CSPRNG both money paths are a
// coin-flip and neither could be asserted without flake. Pin the source instead: 0 always
// wins, 0.99 always loses. Only cryptoRng is replaced; the rest of secure-rng stays real.
const rng = vi.hoisted(() => ({ value: 0 }));
vi.mock("@/lib/secure-rng", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/secure-rng")>()),
  cryptoRng: () => rng.value,
}));

const WIN = 0;
const LOSE = 0.99;

describe("casino games — playGtGame money path (integration, real DB)", () => {
  beforeEach(async () => {
    afterThrows.value = false;
    await resetDb();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const bet = MIN_BET;
  const start = bet * 10;

  it("a winning flip charges the bet and credits the payout — chips only", async () => {
    rng.value = WIN;
    const u = await createUserWithChips(start);

    const r = await playGtGame(u.id, "coinflip", bet);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Coinflip pays 2×, so a win nets +bet. Both legs (charge and credit) must land.
    expect(r.payout).toBe(bet * 2);
    expect(r.net).toBe(bet);
    expect(r.newBalance).toBe(start - bet + bet * 2);
    expect(await chipsOf(u.id)).toBe(r.newBalance);

    const play = await prisma.gtGamePlay.findFirst({ where: { userId: u.id } });
    expect(play?.bet).toBe(bet);
    expect(play?.payout).toBe(bet * 2);
    expect(play?.net).toBe(bet);

    // One spend + one earn, both CHIPS. Weekly ranking, wrapped and economy-health count
    // only `currency: "GT"`, so a mislabelled row would drag casino volume back into the
    // real-economy metrics (the leak Faza 8 of the migration closed).
    const rows = await prisma.transaction.findMany({ where: { userId: u.id }, orderBy: { amount: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.every((t) => t.currency === "CHIPS")).toBe(true);
    expect(rows[0].amount).toBe(-bet);
    expect(rows[1].amount).toBe(bet * 2);

    // The whole point of the chips migration: the real GT economy is untouched.
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("a losing flip charges the bet and pays nothing — still chips only", async () => {
    rng.value = LOSE;
    const u = await createUserWithChips(start);

    const r = await playGtGame(u.id, "coinflip", bet);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.payout).toBe(0);
    expect(r.newBalance).toBe(start - bet);
    expect(await chipsOf(u.id)).toBe(start - bet);

    // A loss writes the spend row ONLY — no winnings row may be invented.
    const rows = await prisma.transaction.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-bet);
    expect(rows[0].currency).toBe("CHIPS");

    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("rejects a bet the player can't afford — no charge, no ledger row, no play row", async () => {
    rng.value = WIN; // even a winning roll must not pay a player who was never charged
    const poor = await createUserWithChips(bet - 1);

    const r = await playGtGame(poor.id, "coinflip", bet);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(402);

    // The charge guard is the only thing standing between "broke" and a free win: the
    // whole transaction must roll back, leaving no play row to pay out from.
    expect(await chipsOf(poor.id)).toBe(bet - 1);
    expect(await prisma.transaction.count({ where: { userId: poor.id } })).toBe(0);
    expect(await prisma.gtGamePlay.count({ where: { userId: poor.id } })).toBe(0);
    expect(await gtLedgerOf(poor.id)).toEqual(GT_SEED);
  });

  it("rejects an out-of-range bet before touching the database at all", async () => {
    const u = await createUserWithChips(start);

    for (const bad of [MIN_BET - 1, MAX_BET + 1, 0, -100, 1.5]) {
      const r = await playGtGame(u.id, "coinflip", bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(400);
    }

    // A negative bet is the dangerous one: `chips: { decrement: -100 }` would CREDIT the
    // player, so the range guard has to reject before the transaction, not inside it.
    expect(await chipsOf(u.id)).toBe(start);
    expect(await prisma.transaction.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.gtGamePlay.count({ where: { userId: u.id } })).toBe(0);
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  // Regression: post-commit side effects must not be able to fail a play that is already paid.
  // Only the ok:true half is observable here — the other half of the old bug (the catch calling
  // refundJackpotSurplus on an already-paid jackpot, minting chips) needs Redis, which this
  // harness has none of, so `claimJackpot()` returns the bare seed and there is no surplus to
  // double-count. What keeps that half fixed is structural: the jackpot refund now lives in a
  // catch that only a FAILED transaction can reach.
  it("a post-commit hook that throws can't undo an already-paid play", async () => {
    afterThrows.value = true;
    rng.value = WIN;
    const u = await createUserWithChips(start);

    const r = await playGtGame(u.id, "coinflip", bet);

    // The old shape returned `{ ok: false, status: 500, error: "Błąd serwera" }` here — for a
    // spin whose payout was already committed. The player was charged, paid, and shown an error.
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payout).toBe(bet * 2);
    expect(r.newBalance).toBe(start - bet + bet * 2);
    expect(await chipsOf(u.id)).toBe(r.newBalance);

    // The money moved exactly once: a failing hook must neither replay nor roll back a leg
    // of the committed transaction.
    const rows = await prisma.transaction.findMany({ where: { userId: u.id }, orderBy: { amount: "asc" } });
    expect(rows.map((t) => t.amount)).toEqual([-bet, bet * 2]);
    expect(rows.every((t) => t.currency === "CHIPS")).toBe(true);
    expect(await prisma.gtGamePlay.count({ where: { userId: u.id } })).toBe(1);
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });
});
