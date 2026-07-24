import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { spinWheel, WheelError, type WheelSegment } from "@/lib/wheel";
import { resetDb, createUserWithChips, chipsOf, gtLedgerOf, GT_SEED } from "./helpers";

const SEGMENTS: WheelSegment[] = [
  { label: "Pudło", weight: 50, rewardTokens: 0, color: "#3f3f46" },
  { label: "200 GT", weight: 50, rewardTokens: 200, color: "#10b981" },
];

async function enableWheel(costPerSpin = 100, segments = SEGMENTS): Promise<void> {
  await prisma.wheelConfig.upsert({
    where: { id: "default" },
    create: { id: "default", enabled: true, costPerSpin, segments },
    update: { enabled: true, costPerSpin, segments },
  });
}

describe("wheel of fortune (integration, real DB)", () => {
  beforeEach(resetDb);
  afterAll(async () => { await prisma.$disconnect(); });

  it("charges the cost, applies the landed reward, and records the spin", async () => {
    const u = await createUserWithChips(1000);
    await enableWheel(100);

    const r = await spinWheel(u.id);

    // Reward is whichever segment was landed on — assert the bookkeeping is consistent.
    // Wheel spends/pays chips (casino currency), so newBalance is the user's chip balance.
    expect([0, 200]).toContain(r.rewardTokens);
    expect(r.newBalance).toBe(1000 - 100 + r.rewardTokens);
    expect(await chipsOf(u.id)).toBe(r.newBalance);

    const spin = await prisma.wheelSpin.findUnique({ where: { id: r.spinId } });
    expect(spin?.rewardTokens).toBe(r.rewardTokens);
    expect(spin?.cost).toBe(100);

    const spend = await prisma.transaction.findFirst({ where: { userId: u.id, reason: "wheel:spin" } });
    expect(spend?.amount).toBe(-100);
    // Ledger rows must be stamped CHIPS — ranking / wrapped / economy-health only
    // count `currency: "GT"`, so a mislabelled row would drag casino play back into
    // the real-economy metrics (the leak Faza 8 of the migration closed).
    expect(spend?.currency).toBe("CHIPS");
    const rows = await prisma.transaction.findMany({ where: { userId: u.id } });
    expect(rows.every((t) => t.currency === "CHIPS")).toBe(true);

    // The whole point of the chips migration: a spin moves chips and NOTHING else.
    // GT balance and both lifetime metrics stay exactly as seeded.
    expect(await gtLedgerOf(u.id)).toEqual(GT_SEED);
  });

  it("rejects a spin when the user can't afford the cost", async () => {
    const u = await createUserWithChips(50);
    await enableWheel(100);
    await expect(spinWheel(u.id)).rejects.toBeInstanceOf(WheelError);
    expect(await chipsOf(u.id)).toBe(50); // untouched
  });

  it("rejects a spin when the wheel is disabled", async () => {
    const u = await createUserWithChips(1000);
    await prisma.wheelConfig.upsert({
      where: { id: "default" },
      create: { id: "default", enabled: false, segments: SEGMENTS },
      update: { enabled: false },
    });
    await expect(spinWheel(u.id)).rejects.toMatchObject({ status: 403 });
  });
});
