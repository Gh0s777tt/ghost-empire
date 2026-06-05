import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { placeWager, resolvePrediction, cancelPrediction, lockExpiredPredictions } from "@/lib/predictions";
import { resetDb, createUser, balanceOf } from "./helpers";

async function makePrediction(options = ["A", "B"]): Promise<string> {
  const p = await prisma.prediction.create({ data: { question: "Kto wygra?", options } });
  return p.id;
}

describe("predictions (integration, real DB)", () => {
  beforeEach(resetDb);
  afterAll(async () => { await prisma.$disconnect(); });

  it("wager deducts tokens, bumps the pot, and blocks a second wager", async () => {
    const u = await createUser(1000);
    const id = await makePrediction();

    const r1 = await placeWager({ userId: u.id, predictionId: id, optionIndex: 0, tokensWagered: 200 });
    expect(r1.ok).toBe(true);
    expect(await balanceOf(u.id)).toBe(800);

    const r2 = await placeWager({ userId: u.id, predictionId: id, optionIndex: 1, tokensWagered: 100 });
    expect(r2.ok).toBe(false); // already wagered
    expect(await balanceOf(u.id)).toBe(800); // refunded on conflict — no double charge

    const pot = await prisma.prediction.findUnique({ where: { id }, select: { totalPot: true } });
    expect(pot?.totalPot).toBe(200);
  });

  it("rejects a wager when the user can't afford it", async () => {
    const u = await createUser(50);
    const id = await makePrediction();
    const r = await placeWager({ userId: u.id, predictionId: id, optionIndex: 0, tokensWagered: 200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(402);
    expect(await balanceOf(u.id)).toBe(50);
  });

  it("resolves and splits the whole pot among winners proportionally", async () => {
    const a = await createUser(1000);
    const b = await createUser(1000);
    const c = await createUser(1000);
    const id = await makePrediction();

    await placeWager({ userId: a.id, predictionId: id, optionIndex: 0, tokensWagered: 100 }); // winner
    await placeWager({ userId: b.id, predictionId: id, optionIndex: 0, tokensWagered: 300 }); // winner
    await placeWager({ userId: c.id, predictionId: id, optionIndex: 1, tokensWagered: 400 }); // loser

    const res = await resolvePrediction({ predictionId: id, winningOptionIndex: 0 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.winnersCount).toBe(2);
      expect(res.potDistributed).toBe(800); // full pot
    }
    // pot 800 split 1:3 → a gets 200, b gets 600. Net of their stakes already deducted.
    expect(await balanceOf(a.id)).toBe(900 + 200);  // 1000-100 + 200
    expect(await balanceOf(b.id)).toBe(700 + 600);  // 1000-300 + 600
    expect(await balanceOf(c.id)).toBe(600);        // 1000-400, no payout
  });

  it("refunds everyone when the winning option had no wagers", async () => {
    const a = await createUser(1000);
    const id = await makePrediction();
    await placeWager({ userId: a.id, predictionId: id, optionIndex: 0, tokensWagered: 250 });

    const res = await resolvePrediction({ predictionId: id, winningOptionIndex: 1 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.refunded).toBe(true);
    expect(await balanceOf(a.id)).toBe(1000); // stake returned
  });

  it("cancel refunds all stakes", async () => {
    const a = await createUser(500);
    const id = await makePrediction();
    await placeWager({ userId: a.id, predictionId: id, optionIndex: 0, tokensWagered: 300 });
    const res = await cancelPrediction(id);
    expect(res.ok).toBe(true);
    expect(await balanceOf(a.id)).toBe(500);
  });

  it("lockExpiredPredictions flips a past-closesAt open bet to locked", async () => {
    const id = await makePrediction();
    await prisma.prediction.update({ where: { id }, data: { closesAt: new Date(Date.now() - 60_000) } });
    const locked = await lockExpiredPredictions();
    expect(locked).toBeGreaterThanOrEqual(1);
    const p = await prisma.prediction.findUnique({ where: { id }, select: { status: true } });
    expect(p?.status).toBe("locked");
  });
});
