import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createDuel, acceptDuel } from "@/lib/duels";
import { duelPayout } from "@/lib/economy";
import { MIN_BET } from "@/lib/gt-games";
import { resetDb, createUser, balanceOf } from "./helpers";

// Covers the duel DB orchestration (escrow + atomic transfer + double-resolve guard) —
// the payout MATH is already unit-tested in economy.test.ts, but the money-moving DB path
// had no coverage (audit v6 HIGH gap). Assertions use invariants (token conservation), not
// the random winner, so they're deterministic.
describe("duels (integration, real DB)", () => {
  beforeEach(resetDb);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const bet = MIN_BET;
  const start = bet * 5;
  const ch = (id: string) => ({ platform: "twitch", challengerId: id, challengerName: "ch", opponentId: null, opponentName: null, bet });

  it("createDuel opens a pending duel WITHOUT charging the challenger (escrow is on accept)", async () => {
    const a = await createUser(start);
    const r = await createDuel(ch(a.id));
    expect(r.ok).toBe(true);
    expect(await balanceOf(a.id)).toBe(start); // not charged yet
    const d = await prisma.duel.findFirst({ where: { challengerId: a.id } });
    expect(d?.status).toBe("pending");
  });

  it("rejects an out-of-range bet and a self-duel", async () => {
    const a = await createUser(start);
    expect((await createDuel({ ...ch(a.id), bet: MIN_BET - 1 })).ok).toBe(false);
    expect((await createDuel({ ...ch(a.id), opponentId: a.id, opponentName: "ch" })).ok).toBe(false);
  });

  it("accept charges both stakes and pays the winner — GT conserved minus the rake", async () => {
    const a = await createUser(start);
    const b = await createUser(start);
    await createDuel(ch(a.id));
    const r = await acceptDuel({ platform: "twitch", accepterId: b.id, accepterName: "acc" });
    expect(r.ok).toBe(true);

    const aAfter = await balanceOf(a.id);
    const bAfter = await balanceOf(b.id);
    const { rake, winnerTakes } = duelPayout(bet);
    // No GT created: total after == total before - rake (the rake is burned).
    expect(aAfter + bAfter).toBe(start + start - rake);
    // One is the winner (start - bet + winnerTakes), the other the loser (start - bet).
    expect([aAfter, bAfter].sort((x, y) => x - y)).toEqual(
      [start - bet, start - bet + winnerTakes].sort((x, y) => x - y),
    );
    const d = await prisma.duel.findFirst({ where: { challengerId: a.id } });
    expect(d?.status).toBe("resolved");
  });

  it("a second accept finds no pending duel — no double payout", async () => {
    const a = await createUser(start);
    const b1 = await createUser(start);
    const b2 = await createUser(start);
    await createDuel(ch(a.id));
    expect((await acceptDuel({ platform: "twitch", accepterId: b1.id, accepterName: "b1" })).ok).toBe(true);
    const r2 = await acceptDuel({ platform: "twitch", accepterId: b2.id, accepterName: "b2" });
    expect(r2.ok).toBe(false);
    expect(await balanceOf(b2.id)).toBe(start); // untouched
  });

  it("rejects accept when the accepter can't afford the bet (both stay untouched)", async () => {
    const a = await createUser(start);
    const poor = await createUser(bet - 1);
    await createDuel(ch(a.id));
    const r = await acceptDuel({ platform: "twitch", accepterId: poor.id, accepterName: "poor" });
    expect(r.ok).toBe(false);
    expect(await balanceOf(poor.id)).toBe(bet - 1); // not charged
    expect(await balanceOf(a.id)).toBe(start); // challenger charge rolled back too
  });
});
