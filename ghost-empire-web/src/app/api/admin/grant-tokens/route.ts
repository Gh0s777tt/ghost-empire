// src/app/api/admin/grant-tokens/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

export async function POST(req: Request) {
  const auth = await requirePermission("grant_tokens");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { target?: string; amount?: number; reason?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const target = body.target?.trim();
  const amount = Math.floor(Number(body.amount ?? 0));
  const reason = (body.reason ?? "admin_grant").trim().slice(0, 200);

  if (!target) return NextResponse.json({ error: "Brak target (username/discordId)" }, { status: 400 });
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "Amount musi być liczbą != 0" }, { status: 400 });
  }
  if (amount < -1_000_000 || amount > 1_000_000) {
    return NextResponse.json({ error: "Amount musi być w zakresie ±1,000,000" }, { status: 400 });
  }

  // Try discordId first (digits only), then username
  const isDigits = /^\d+$/.test(target);
  const user = isDigits
    ? await prisma.user.findUnique({ where: { discordId: target } })
    : await prisma.user.findUnique({ where: { username: target } });

  if (!user) {
    return NextResponse.json(
      { error: `User "${target}" nie znaleziony (${isDigits ? "discordId" : "username"})` },
      { status: 404 },
    );
  }

  if (amount < 0 && user.tokens + amount < 0) {
    return NextResponse.json(
      { error: `User ma tylko ${user.tokens} GT, nie można odjąć ${Math.abs(amount)}` },
      { status: 400 },
    );
  }

  const isGrant = amount > 0;

  const [, updatedUser] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        userId: user.id,
        type: isGrant ? "admin_grant" : "admin_deduct",
        amount,
        reason,
        status: "completed",
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        tokens: { increment: amount },
        ...(isGrant
          ? { totalEarned: { increment: amount } }
          : { totalSpent: { increment: Math.abs(amount) } }),
      },
    }),
  ]);

  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "system",
      title: isGrant ? "Otrzymałeś tokeny" : "Tokeny odjęte",
      message: isGrant
        ? `Admin przyznał Ci ${amount} GT (${reason})`
        : `Admin odjął ${Math.abs(amount)} GT (${reason})`,
      icon: isGrant ? "🎁" : "⚠️",
    },
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "grant_tokens",
    targetType: "user",
    targetId: user.id,
    details: { amount, reason, targetUsername: user.username, newBalance: updatedUser.tokens },
    req,
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, displayName: user.displayName },
    amount,
    newBalance: updatedUser.tokens,
  });
}
