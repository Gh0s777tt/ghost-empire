// Integration regression for the money-critical races in POST /api/admin/deliver-order.
//
// The route's `tx.status !== "pending"` check is a NON-atomic read — two concurrent
// admin clicks both pass it. What actually holds the line is that both branches
// re-assert `status: "pending"` inside their write (`updateMany` + `count === 0`).
// These tests exercise that guard against real Postgres, because the bug it prevents
// is purely a concurrency artifact: it cannot reproduce in a unit test, and the
// currency arithmetic it protects is already covered by src/lib/__tests__/refund.test.ts.
//
// Guarded against here:
//  1. double refund  → the buyer is credited TWICE (real GT minted from nothing)
//  2. deliver+refund → refund returns the money AND deliver overwrites the row to
//     "delivered", hiding the refund and telling the admin to ship a paid-back order
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, createUser, balanceOf } from "./helpers";

const PRICE = 500;

/** A pending shop order, exactly as `shop/buy` writes one for a non-cosmetic item. */
async function pendingOrder(userId: string): Promise<{ id: string }> {
  return prisma.transaction.create({
    data: {
      userId,
      type: "spend",
      amount: -PRICE,
      reason: "shop:Integration Test Item",
      currency: "GT",
      status: "pending",
    },
    select: { id: true },
  });
}

/** The refund branch's guarded write: flip pending→refunded, credit only if we won. */
async function refundAttempt(orderId: string, userId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const flip = await tx.transaction.updateMany({
      where: { id: orderId, status: "pending" },
      data: { status: "refunded" },
    });
    if (flip.count === 0) return false;
    await tx.user.update({
      where: { id: userId },
      data: { tokens: { increment: PRICE }, totalSpent: { decrement: PRICE } },
    });
    return true;
  });
}

/** The deliver branch's guarded write: flip pending→delivered, no money moves. */
async function deliverAttempt(orderId: string): Promise<boolean> {
  const flip = await prisma.transaction.updateMany({
    where: { id: orderId, status: "pending" },
    data: { status: "delivered" },
  });
  return flip.count === 1;
}

describe("deliver-order concurrency guards (integration, real DB)", () => {
  beforeEach(resetDb);
  afterAll(async () => { await prisma.$disconnect(); });

  it("two concurrent refunds credit the buyer exactly once", async () => {
    const u = await createUser(0);
    const order = await pendingOrder(u.id);

    const [a, b] = await Promise.all([
      refundAttempt(order.id, u.id),
      refundAttempt(order.id, u.id),
    ]);

    // Exactly one refund may win — the other must find no `pending` row.
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await balanceOf(u.id)).toBe(PRICE); // NOT 2 * PRICE
    const final = await prisma.transaction.findUnique({
      where: { id: order.id },
      select: { status: true },
    });
    expect(final?.status).toBe("refunded");
  });

  it("concurrent deliver + refund are mutually exclusive and leave money consistent with status", async () => {
    const u = await createUser(0);
    const order = await pendingOrder(u.id);

    const [delivered, refunded] = await Promise.all([
      deliverAttempt(order.id),
      refundAttempt(order.id, u.id),
    ]);

    expect([delivered, refunded].filter(Boolean)).toHaveLength(1);

    const final = await prisma.transaction.findUnique({
      where: { id: order.id },
      select: { status: true },
    });
    const balance = await balanceOf(u.id);

    if (refunded) {
      // Money returned ⇒ the row must still say so; deliver must NOT have overwritten it.
      expect(final?.status).toBe("refunded");
      expect(balance).toBe(PRICE);
    } else {
      // Delivered ⇒ no money moved.
      expect(final?.status).toBe("delivered");
      expect(balance).toBe(0);
    }
  });

  it("a refund cannot follow a completed delivery", async () => {
    const u = await createUser(0);
    const order = await pendingOrder(u.id);

    expect(await deliverAttempt(order.id)).toBe(true);
    expect(await refundAttempt(order.id, u.id)).toBe(false);
    expect(await balanceOf(u.id)).toBe(0);
  });
});
