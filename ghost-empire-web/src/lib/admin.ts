// src/lib/admin.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ModPermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

type AuthResult =
  | { ok: true; userId: string; isAdmin: boolean }
  | { ok: false; status: number; error: string };

/** Strict admin check — for endpoints that should NEVER be exposed to mods
 *  (e.g. role management — granting admin/mod roles to others). */
export async function requireAdmin(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Musisz być zalogowany" };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, isBanned: true },
  });
  if (!user || user.isBanned) {
    return { ok: false, status: 403, error: "Brak uprawnień" };
  }
  if (!user.isAdmin) {
    return { ok: false, status: 403, error: "Brak uprawnień admina" };
  }
  return { ok: true, userId: session.user.id, isAdmin: true };
}

/** Permission check — passes for admins (implicit grant) and moderators
 *  whose `modPermissions` array contains the requested permission. */
export async function requirePermission(permission: ModPermission): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Musisz być zalogowany" };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, isModerator: true, modPermissions: true, isBanned: true },
  });
  if (!user || user.isBanned) {
    return { ok: false, status: 403, error: "Brak uprawnień" };
  }
  if (!hasPermission(user, permission)) {
    return {
      ok: false,
      status: 403,
      error: user.isModerator
        ? `Twoja rola moderatora nie ma uprawnienia "${permission}"`
        : "Brak uprawnień admina/moderatora",
    };
  }
  return { ok: true, userId: session.user.id, isAdmin: user.isAdmin };
}
