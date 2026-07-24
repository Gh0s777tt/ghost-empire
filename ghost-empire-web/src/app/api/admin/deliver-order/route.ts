// src/app/api/admin/deliver-order/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
import { logAdminAction } from "@/lib/audit";
import { planRefund } from "@/lib/refund";

/**
 * Thrown inside the refund `$transaction` when the atomic status flip matches no
 * `pending` row — a concurrent refund (double-click / two admins) already won the
 * race. Caught below to return 409 so we never credit the same order twice.
 */
class RefundNotPending extends Error {}

export async function POST(req: Request) {
  const auth = await requirePermission("deliver_orders");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { transactionId?: string; note?: string; action?: "deliver" | "refund" };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const transactionId = body.transactionId;
  const action = body.action ?? "deliver";
  const note = body.note?.trim().slice(0, 500) || null;

  if (!transactionId) return NextResponse.json({ error: "Brak transactionId" }, { status: 400 });
  if (action !== "deliver" && action !== "refund") {
    return NextResponse.json({ error: "Action: deliver | refund" }, { status: 400 });
  }

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { shopItem: true, user: { select: { tenantId: true } } },
  });
  if (!tx) return NextResponse.json({ error: "Transakcja nie istnieje" }, { status: 404 });
  // Tenant isolation: a tenant admin must not deliver/refund another portal's
  // order. The platform owner manages across tenants (admin-of-admins).
  if (!auth.isPlatformOwner) {
    const tid = await currentTenantId();
    if (tid && tx.user.tenantId && tx.user.tenantId !== tid) {
      return NextResponse.json({ error: "Transakcja nie istnieje" }, { status: 404 });
    }
  }
  if (tx.type !== "spend") {
    return NextResponse.json({ error: "Tylko zakupy można oznaczyć" }, { status: 400 });
  }
  // NOTE: this is a NON-atomic read-check — it only produces a nice error message.
  // Both branches below re-assert `status: "pending"` inside their write, which is
  // the guard that actually holds under concurrency.
  if (tx.status !== "pending") {
    return NextResponse.json({ error: `Status już ${tx.status}` }, { status: 409 });
  }

  if (action === "deliver") {
    // Same atomic guard as the refund branch: an unconditional update() here would
    // let a concurrent deliver+refund pair BOTH win — refund credits the money back
    // and then deliver overwrites the row to "delivered", hiding the refund and
    // telling the admin to ship goods that were already paid back. Re-asserting
    // `status: "pending"` makes the two mutually exclusive: first writer wins, the
    // loser gets 409. It also collapses a double-click into one notification.
    const flip = await prisma.transaction.updateMany({
      where: { id: transactionId, status: "pending" },
      data: { status: "delivered", note },
    });
    if (flip.count === 0) {
      return NextResponse.json({ error: "Zamówienie nie jest już w statusie pending" }, { status: 409 });
    }
    await prisma.notification.create({
      data: {
        userId: tx.userId,
        type: "shop_delivered",
        title: "Zamówienie dostarczone",
        message: `${tx.shopItem?.name ?? "Twój zakup"} został dostarczony.${note ? ` Notatka: ${note}` : ""}`,
        icon: tx.shopItem?.imageEmoji ?? "📦",
        link: "/profile",
      },
    });
    await logAdminAction({
      adminId: auth.userId,
      action: "deliver_order",
      targetType: "transaction",
      targetId: transactionId,
      details: { userId: tx.userId, item: tx.shopItem?.name, amount: tx.amount, note },
      req,
    });
    return NextResponse.json({ ok: true, status: "delivered" });
  }

  // Refund: restore the SAME currency that was spent, restore stock, mark refunded.
  const refundAmount = Math.abs(tx.amount);
  // Money-critical branch: a CHIPS order must credit free chips, never mint real GT
  // (and must not touch totalSpent). See planRefund / docs/CHIPS-CASINO.md.
  const plan = planRefund(tx.currency, refundAmount);

  // Run as an interactive transaction so the status flip is an atomic guard: only
  // the first refund of a still-`pending` order wins. The earlier `tx.status`
  // check is a non-atomic read — two concurrent requests can both pass it, so the
  // updateMany below (count===0 ⇒ abort) is the real double-credit backstop, same
  // pattern as shop/buy stock and grant-tokens balance.
  try {
    await prisma.$transaction(async (dbtx) => {
      const flip = await dbtx.transaction.updateMany({
        where: { id: transactionId, status: "pending" },
        data: { status: "refunded", note },
      });
      if (flip.count === 0) throw new RefundNotPending();

      await dbtx.user.update({
        where: { id: tx.userId },
        data: plan.isChips
          ? { chips: { increment: plan.chipsDelta } }
          : { tokens: { increment: plan.tokensDelta }, totalSpent: { decrement: plan.totalSpentDelta } },
      });

      await dbtx.transaction.create({
        data: {
          userId: tx.userId,
          type: "refund",
          amount: refundAmount,
          reason: `refund:${tx.reason}`,
          shopItemId: tx.shopItemId,
          currency: plan.refundCurrency,
          status: "completed",
          note,
        },
      });

      if (tx.shopItemId && tx.shopItem && tx.shopItem.stock !== -1) {
        await dbtx.shopItem.update({
          where: { id: tx.shopItemId },
          data: { stock: { increment: 1 } },
        });
      }

      await dbtx.notification.create({
        data: {
          userId: tx.userId,
          type: "system",
          title: "Zwrot środków",
          message: `Otrzymałeś ${refundAmount} ${plan.isChips ? "żetonów" : "GT"} z powrotem za "${tx.shopItem?.name ?? tx.reason}".${note ? ` ${note}` : ""}`,
          icon: "💰",
        },
      });
    });
  } catch (e) {
    if (e instanceof RefundNotPending) {
      return NextResponse.json({ error: "Zamówienie nie jest już w statusie pending" }, { status: 409 });
    }
    throw e;
  }

  await logAdminAction({
    adminId: auth.userId,
    action: "refund_order",
    targetType: "transaction",
    targetId: transactionId,
    details: { userId: tx.userId, item: tx.shopItem?.name, refunded: refundAmount, currency: plan.refundCurrency, note },
    req,
  });

  return NextResponse.json({ ok: true, status: "refunded", refunded: refundAmount, currency: plan.refundCurrency });
}
