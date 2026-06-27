// src/app/api/admin/role-roster/route.ts
// Roster of privileged users for THIS portal (#700) — who holds owner / admin / moderator,
// so the owner can see at a glance who has what role + which mod permissions. Read-only,
// admin-gated, tenant-scoped (a tenant admin never sees another portal's staff).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = auth.tenantId;
  const scope = tid ? { tenantId: tid } : {};

  const [users, tenant] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ isAdmin: true }, { isModerator: true }], ...scope },
      select: {
        id: true, username: true, displayName: true, image: true,
        isAdmin: true, isModerator: true, modPermissions: true, isBanned: true, createdAt: true,
      },
      orderBy: [{ isAdmin: "desc" }, { isModerator: "desc" }, { createdAt: "asc" }],
      take: 300,
    }),
    tid ? prisma.tenant.findUnique({ where: { id: tid }, select: { ownerUserId: true } }) : Promise.resolve(null),
  ]);

  const ownerId = tenant?.ownerUserId ?? null;
  return NextResponse.json({
    ownerId,
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      image: u.image,
      isAdmin: u.isAdmin,
      isModerator: u.isModerator,
      modPermissions: u.modPermissions,
      isBanned: u.isBanned,
      isOwner: u.id === ownerId,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}
