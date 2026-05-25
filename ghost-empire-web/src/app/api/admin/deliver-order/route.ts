// src/app/api/admin/deliver-order/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

export async function POST(req: Request) {
  const auth = await requireAdmin();
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
    include: { shopItem: true },
  });
  if (!tx) return NextResponse.json({ error: "Transakcja nie istnieje" }, { status: 404 });
  if (tx.type !== "spend") {
    return NextResponse.json({ error: "Tylko zakupy można oznaczyć" }, { status: 400 });
  }
  if (tx.status !== "pending") {
    return NextResponse.json({ error: `Status już ${tx.status}` }, { status: 409 });
  }

  if (action === "deliver") {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: "delivered", note },
    });
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

  // Refund: restore tokens, restore stock, mark refunded
  const refundAmount = Math.abs(tx.amount);

  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transactionId },
      data: { status: "refunded", note },
    }),
    prisma.user.update({
      where: { id: tx.userId },
      data: {
        tokens: { increment: refundAmount },
        totalSpent: { decrement: refundAmount },
      },
    }),
    prisma.transaction.create({
      data: {
        userId: tx.userId,
        type: "refund",
        amount: refundAmount,
        reason: `refund:${tx.reason}`,
        shopItemId: tx.shopItemId,
        status: "completed",
        note,
      },
    }),
    ...(tx.shopItemId && tx.shopItem && tx.shopItem.stock !== -1
      ? [
          prisma.shopItem.update({
            where: { id: tx.shopItemId },
            data: { stock: { increment: 1 } },
          }),
        ]
      : []),
    prisma.notification.create({
      data: {
        userId: tx.userId,
        type: "system",
        title: "Zwrot środków",
        message: `Otrzymałeś ${refundAmount} GT z powrotem za "${tx.shopItem?.name ?? tx.reason}".${note ? ` ${note}` : ""}`,
        icon: "💰",
      },
    }),
  ]);

  await logAdminAction({
    adminId: auth.userId,
    action: "refund_order",
    targetType: "transaction",
    targetId: transactionId,
    details: { userId: tx.userId, item: tx.shopItem?.name, refunded: refundAmount, note },
    req,
  });

  return NextResponse.json({ ok: true, status: "refunded", refunded: refundAmount });
}
