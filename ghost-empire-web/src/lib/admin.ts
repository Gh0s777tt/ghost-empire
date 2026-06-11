// src/lib/admin.ts
import { auth, isPermanentAdminEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import type { ModPermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

type AuthResult =
  | { ok: true; userId: string; isAdmin: boolean; tenantId: string | null; isPlatformOwner: boolean }
  | { ok: false; status: number; error: string };

/**
 * Platform-owner gate (SaaS Phase 6, admin-of-admins): ONLY the permanent-admin
 * email may manage tenants (create portals, set plans/branding). A tenant's own
 * admin must never see other tenants — requireAdmin is NOT enough here.
 */
export async function requirePlatformOwner(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Musisz być zalogowany" };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, isBanned: true, email: true },
  });
  if (!user || user.isBanned || !user.isAdmin || !isPermanentAdminEmail(user.email)) {
    return { ok: false, status: 403, error: "Tylko właściciel platformy" };
  }
  return { ok: true, userId: session.user.id, isAdmin: true, tenantId: null, isPlatformOwner: true };
}

/**
 * Resolve a target user (account id / username / Discord id) for an admin
 * MANAGEMENT action (roles, tokens, bans, deliveries), SCOPED to the host
 * tenant — so a tenant-A admin can never touch a tenant-B user (cross-tenant
 * privilege escalation). The platform owner resolves globally (admin-of-admins).
 * Returns null when the target doesn't exist within the caller's scope.
 */
export async function findManagedUser(target: string, gate: { isPlatformOwner: boolean }) {
  const or = [{ id: target }, { username: target }, { discordId: target }];
  if (gate.isPlatformOwner) return prisma.user.findFirst({ where: { OR: or } });
  const tid = await currentTenantId();
  // No host tenant (single-tenant / legacy) → no isolation boundary to enforce.
  const where = tid ? { AND: [{ OR: or }, { tenantId: tid }] } : { OR: or };
  return prisma.user.findFirst({ where });
}

/**
 * Cross-tenant guard (SaaS Phase 4): an admin/moderator of tenant A must not
 * administer tenant B's subdomain — global `isAdmin` alone would let them.
 * The platform owner (permanent admin email) passes everywhere
 * (admin-of-admins). Legacy NULL tenantId passes — those accounts self-heal
 * on next login (#369), and single-tenant deployments resolve to one tenant
 * anyway.
 */
async function isWrongTenant(user: { tenantId: string | null; email: string | null }): Promise<boolean> {
  if (!user.tenantId) return false;
  if (isPermanentAdminEmail(user.email)) return false;
  const tid = await currentTenantId();
  if (!tid) return false;
  return user.tenantId !== tid;
}

/** Strict admin check — for endpoints that should NEVER be exposed to mods
 *  (e.g. role management — granting admin/mod roles to others). */
export async function requireAdmin(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Musisz być zalogowany" };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, isBanned: true, tenantId: true, email: true },
  });
  if (!user || user.isBanned) {
    return { ok: false, status: 403, error: "Brak uprawnień" };
  }
  if (await isWrongTenant(user)) {
    return { ok: false, status: 403, error: "Brak uprawnień w tym portalu" };
  }
  if (!user.isAdmin) {
    return { ok: false, status: 403, error: "Brak uprawnień admina" };
  }
  return { ok: true, userId: session.user.id, isAdmin: true, tenantId: user.tenantId, isPlatformOwner: isPermanentAdminEmail(user.email) };
}

/** Admin OR moderator (any/no permissions) on THIS tenant — for panel-wide
 *  features open to everyone who can open /admin (e.g. the AI assistant).
 *  Carries the same cross-tenant guard as the stricter gates. */
export async function requireAdminOrModerator(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Musisz być zalogowany" };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, isModerator: true, isBanned: true, tenantId: true, email: true },
  });
  if (!user || user.isBanned || (!user.isAdmin && !user.isModerator)) {
    return { ok: false, status: 403, error: "Brak uprawnień" };
  }
  if (await isWrongTenant(user)) {
    return { ok: false, status: 403, error: "Brak uprawnień w tym portalu" };
  }
  return { ok: true, userId: session.user.id, isAdmin: user.isAdmin, tenantId: user.tenantId, isPlatformOwner: isPermanentAdminEmail(user.email) };
}

/** Permission check — passes for admins (implicit grant) and moderators
 *  whose `modPermissions` array contains the requested permission. */
export async function requirePermission(permission: ModPermission): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Musisz być zalogowany" };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, isModerator: true, modPermissions: true, isBanned: true, tenantId: true, email: true },
  });
  if (!user || user.isBanned) {
    return { ok: false, status: 403, error: "Brak uprawnień" };
  }
  if (await isWrongTenant(user)) {
    return { ok: false, status: 403, error: "Brak uprawnień w tym portalu" };
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
  return { ok: true, userId: session.user.id, isAdmin: user.isAdmin, tenantId: user.tenantId, isPlatformOwner: isPermanentAdminEmail(user.email) };
}

/** Like `requirePermission` but passes if the user has ANY of the given
 *  permissions (admins always pass). For sections that bundle actions guarded
 *  by different permissions — e.g. the events manager (edit + draw). */
export async function requireAnyPermission(permissions: ModPermission[]): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Musisz być zalogowany" };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, isModerator: true, modPermissions: true, isBanned: true, tenantId: true, email: true },
  });
  if (!user || user.isBanned) {
    return { ok: false, status: 403, error: "Brak uprawnień" };
  }
  if (await isWrongTenant(user)) {
    return { ok: false, status: 403, error: "Brak uprawnień w tym portalu" };
  }
  if (!permissions.some((p) => hasPermission(user, p))) {
    return {
      ok: false,
      status: 403,
      error: user.isModerator
        ? `Twoja rola moderatora nie ma żadnego z uprawnień: ${permissions.join(", ")}`
        : "Brak uprawnień admina/moderatora",
    };
  }
  return { ok: true, userId: session.user.id, isAdmin: user.isAdmin, tenantId: user.tenantId, isPlatformOwner: isPermanentAdminEmail(user.email) };
}
