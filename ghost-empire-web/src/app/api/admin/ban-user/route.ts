// src/app/api/admin/ban-user/route.ts
// Site-level ban (User.isBanned). Banned users can't log in (sessions destroyed,
// signIn callback blocks them). Permanent or with duration.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, findManagedUser } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

export async function POST(req: Request) {
  const auth = await requirePermission("ban_users");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    target?: string;
    action?: "ban" | "unban";
    durationDays?: number;     // 0 / undefined = permanent
    reason?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const target = body.target?.trim();
  const action = body.action;
  const reason = body.reason?.trim().slice(0, 500) || null;

  if (!target) return NextResponse.json({ error: "Brak target" }, { status: 400 });
  if (action !== "ban" && action !== "unban") {
    return NextResponse.json({ error: "action: ban | unban" }, { status: 400 });
  }

  // Scoped to the host tenant — a tenant admin must not ban another portal's user.
  const user = await findManagedUser(target, auth);

  if (!user) {
    return NextResponse.json({ error: `User "${target}" nie znaleziony` }, { status: 404 });
  }

  if (user.isAdmin && action === "ban") {
    return NextResponse.json({ error: "Nie można zbanować admina" }, { status: 403 });
  }

  if (action === "ban") {
    const durationDays = Math.floor(Number(body.durationDays ?? 0));
    const bannedUntil = durationDays > 0
      ? new Date(Date.now() + durationDays * 86_400_000)
      : null; // permanent

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isBanned: true,
        bannedUntil,
        banReason: reason,
      },
    });

    // Destroy all active sessions (force logout)
    await prisma.session.deleteMany({ where: { userId: user.id } });

    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "system",
        title: "Konto zablokowane",
        message: bannedUntil
          ? `Twoje konto zostało zablokowane do ${bannedUntil.toLocaleDateString("pl-PL")}.${reason ? ` Powód: ${reason}` : ""}`
          : `Twoje konto zostało zablokowane na stałe.${reason ? ` Powód: ${reason}` : ""}`,
        icon: "🚫",
      },
    });

    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "user",
      targetId: user.id,
      details: { ban: true, durationDays, bannedUntil, reason, targetUsername: user.username },
      req,
    });

    return NextResponse.json({ ok: true, user: { id: user.id, isBanned: true, bannedUntil } });
  }

  // Unban
  await prisma.user.update({
    where: { id: user.id },
    data: { isBanned: false, bannedUntil: null, banReason: null },
  });

  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "system",
      title: "Konto odblokowane",
      message: "Twoje konto zostało odblokowane. Możesz znów się zalogować.",
      icon: "✅",
    },
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "set_user_role",
    targetType: "user",
    targetId: user.id,
    details: { unban: true, targetUsername: user.username },
    req,
  });

  return NextResponse.json({ ok: true, user: { id: user.id, isBanned: false } });
}
