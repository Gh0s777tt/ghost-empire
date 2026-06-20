// src/app/api/gift/route.ts
// P2P GT gifting (#553): send GT to another viewer in the same portal. The debit +
// credit + both ledger rows are ONE atomic transaction (the `gte` guard makes overspend
// impossible). Anti-abuse: not self, per-transfer + rolling-24h daily caps, rate-limited.
// Recipient gets a best-effort in-app notification (outside the tx so it can't undo a
// real transfer).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { clampGift, giftError } from "@/lib/gift";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  const senderId = session.user.id;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`gift:${senderId}:${ip}`, 20, 60_000, { failClosed: false });
  if (!rl.allowed) return NextResponse.json({ ok: false, reason: "rate-limited" }, { status: 429 });

  let body: { toUsername?: string; amount?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, reason: "bad" }, { status: 400 }); }
  const toUsername = String(body.toUsername ?? "").trim().slice(0, 40);
  const amount = clampGift(Number(body.amount));

  const tid = await currentTenantId();
  const recipient = await prisma.user.findFirst({ where: { username: toUsername, ...(tid ? { tenantId: tid } : {}) }, select: { id: true } }).catch(() => null);
  if (!recipient) return NextResponse.json({ ok: false, reason: "no-user" });
  if (recipient.id === senderId) return NextResponse.json({ ok: false, reason: "self" });

  // Sender balance + how much they've already gifted in the rolling 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [sender, sentAgg] = await Promise.all([
    prisma.user.findUnique({ where: { id: senderId }, select: { tokens: true } }),
    prisma.transaction.aggregate({ _sum: { amount: true }, where: { userId: senderId, reason: "gift_sent", createdAt: { gte: since } } }),
  ]);
  const balance = sender?.tokens ?? 0;
  const sentToday = Math.abs(sentAgg._sum.amount ?? 0);
  const err = giftError(amount, balance, sentToday);
  if (err) return NextResponse.json({ ok: false, reason: err });

  try {
    const res = await prisma.$transaction(async (tx) => {
      const pay = await tx.user.updateMany({ where: { id: senderId, tokens: { gte: amount } }, data: { tokens: { decrement: amount } } });
      if (pay.count === 0) return { insufficient: true as const };
      await tx.user.update({ where: { id: recipient.id }, data: { tokens: { increment: amount } } });
      await tx.transaction.create({ data: { userId: senderId, type: "spend", amount: -amount, reason: "gift_sent" } });
      await tx.transaction.create({ data: { userId: recipient.id, type: "earn", amount, reason: "gift_received" } });
      const u = await tx.user.findUnique({ where: { id: senderId }, select: { tokens: true } });
      return { balance: u?.tokens ?? 0 };
    });
    if ("insufficient" in res) return NextResponse.json({ ok: false, reason: "insufficient" });

    const senderName = session.user.username || "Someone";
    await prisma.notification
      .create({ data: { userId: recipient.id, type: "system", title: "💸 GT gift", message: `${senderName} sent you ${amount} GT`, icon: "💸", link: "/profile" } })
      .catch(() => {});

    return NextResponse.json({ ok: true, balance: res.balance });
  } catch {
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }
}
