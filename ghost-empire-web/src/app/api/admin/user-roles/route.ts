// src/app/api/admin/user-roles/route.ts
// Grant/revoke isModerator, isDonator (with optional totalDonated bump), isAdmin
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    target?: string;
    role?: "admin" | "moderator" | "donator";
    enable?: boolean;
    addDonation?: number;
    modNote?: string;
    modPermissions?: string[];
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const target = body.target?.trim();
  const role = body.role;
  const enable = body.enable ?? true;
  const addDonation = Math.floor(Number(body.addDonation ?? 0));
  const modNote = body.modNote?.trim().slice(0, 500);

  if (!target) return NextResponse.json({ error: "Brak target" }, { status: 400 });
  if (!["admin", "moderator", "donator"].includes(role ?? "")) {
    return NextResponse.json({ error: "Role: admin | moderator | donator" }, { status: 400 });
  }

  // Accept account ID (cuid), username, or Discord ID — admins may paste any of them.
  const user =
    (await prisma.user.findUnique({ where: { id: target } })) ??
    (await prisma.user.findUnique({ where: { username: target } })) ??
    (/^\d+$/.test(target) ? await prisma.user.findUnique({ where: { discordId: target } }) : null);

  if (!user) {
    return NextResponse.json(
      { error: `User "${target}" nie znaleziony` },
      { status: 404 },
    );
  }

  const data: Record<string, unknown> = {};
  if (role === "admin") data.isAdmin = enable;
  if (role === "moderator") {
    data.isModerator = enable;
    // Permissions only set when enabling mod, cleared when disabling
    if (enable && Array.isArray(body.modPermissions)) {
      // Whitelist filter — only allow known permission IDs
      const { MOD_PERMISSIONS } = await import("@/lib/permissions");
      const validIds = MOD_PERMISSIONS.map((p) => p.id);
      data.modPermissions = body.modPermissions.filter((p) => validIds.includes(p as never));
    } else if (!enable) {
      data.modPermissions = [];
    }
  }
  if (role === "donator") {
    data.isDonator = enable;
    if (addDonation > 0) data.totalDonated = { increment: addDonation };
  }
  if (modNote !== undefined) data.modNote = modNote || null;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true, username: true, displayName: true,
      isAdmin: true, isModerator: true, isDonator: true, totalDonated: true,
    },
  });

  // Notify user
  const roleLabels: Record<string, string> = {
    admin: "administratora",
    moderator: "moderatora",
    donator: "donatora",
  };
  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "system",
      title: enable
        ? `Otrzymałeś rolę ${roleLabels[role as string]}`
        : `Rola ${roleLabels[role as string]} odebrana`,
      message: enable
        ? `Admin przyznał Ci rangę ${role}. Gratulacje!`
        : `Twoja rola ${role} została odebrana.`,
      icon: enable ? "👑" : "📋",
    },
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "set_user_role",
    targetType: "user",
    targetId: user.id,
    details: { role, enable, addDonation, targetUsername: user.username },
    req,
  });

  return NextResponse.json({ ok: true, user: updated });
}
