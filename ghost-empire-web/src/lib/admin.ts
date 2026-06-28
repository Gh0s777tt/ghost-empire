// src/lib/admin.ts
import { auth, isPermanentAdminEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import type { ModPermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";
import { decryptSecret } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { createLogger } from "@/lib/logger";

const log = createLogger("admin");

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

type GatedUser = {
  isAdmin: boolean;
  isModerator: boolean;
  modPermissions: string[];
  isBanned: boolean;
  tenantId: string | null;
  email: string | null;
};

/** Shared front half of every gate: session → user → not-banned → right-tenant.
 *  Each gate then applies its own role/permission check on the returned user. */
async function loadGatedUser(): Promise<{ ok: true; userId: string; user: GatedUser } | { ok: false; status: number; error: string }> {
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
  return { ok: true, userId: session.user.id, user };
}

function okResult(userId: string, user: GatedUser): Extract<AuthResult, { ok: true }> {
  return { ok: true, userId, isAdmin: user.isAdmin, tenantId: user.tenantId, isPlatformOwner: isPermanentAdminEmail(user.email) };
}

/** Strict admin check — for endpoints that should NEVER be exposed to mods
 *  (e.g. role management — granting admin/mod roles to others). */
export async function requireAdmin(): Promise<AuthResult> {
  const g = await loadGatedUser();
  if (!g.ok) return g;
  if (!g.user.isAdmin) {
    return { ok: false, status: 403, error: "Brak uprawnień admina" };
  }
  return okResult(g.userId, g.user);
}

/** Admin OR moderator (any/no permissions) on THIS tenant — for panel-wide
 *  features open to everyone who can open /admin (e.g. the AI assistant).
 *  Carries the same cross-tenant guard as the stricter gates. */
export async function requireAdminOrModerator(): Promise<AuthResult> {
  const g = await loadGatedUser();
  if (!g.ok) return g;
  if (!g.user.isAdmin && !g.user.isModerator) {
    return { ok: false, status: 403, error: "Brak uprawnień" };
  }
  return okResult(g.userId, g.user);
}

/** Permission check — passes for admins (implicit grant) and moderators
 *  whose `modPermissions` array contains the requested permission. */
export async function requirePermission(permission: ModPermission): Promise<AuthResult> {
  const g = await loadGatedUser();
  if (!g.ok) return g;
  if (!hasPermission(g.user, permission)) {
    return {
      ok: false,
      status: 403,
      error: g.user.isModerator
        ? `Twoja rola moderatora nie ma uprawnienia "${permission}"`
        : "Brak uprawnień admina/moderatora",
    };
  }
  return okResult(g.userId, g.user);
}

/** Like `requirePermission` but passes if the user has ANY of the given
 *  permissions (admins always pass). For sections that bundle actions guarded
 *  by different permissions — e.g. the events manager (edit + draw). */
export async function requireAnyPermission(permissions: ModPermission[]): Promise<AuthResult> {
  const g = await loadGatedUser();
  if (!g.ok) return g;
  if (!permissions.some((p) => hasPermission(g.user, p))) {
    return {
      ok: false,
      status: 403,
      error: g.user.isModerator
        ? `Twoja rola moderatora nie ma żadnego z uprawnień: ${permissions.join(", ")}`
        : "Brak uprawnień admina/moderatora",
    };
  }
  return okResult(g.userId, g.user);
}

/**
 * Step-up check for a sensitive admin action. A NO-OP when the acting admin has
 * not enabled 2FA (it's opt-in) — only admins who turned it on are challenged.
 * When enabled, a valid current TOTP code is required.
 *
 * On encryption-key drift (the stored secret no longer decrypts) the DEFAULT is to
 * fail OPEN, so a 2FA-enabled admin is never permanently locked out of their own
 * tools. Callers guarding the most destructive paths (global DB wipe) pass
 * `failClosed:true` to BLOCK instead and force key remediation rather than silently
 * skipping the second factor. #audit-W1
 */
export async function requireStepUp(
  userId: string,
  code: string | null | undefined,
  opts?: { failClosed?: boolean },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpEnabledAt: true } });
  if (!u?.totpEnabledAt) return { ok: true }; // 2FA not enabled → no challenge
  const secret = decryptSecret(u.totpSecret);
  if (!secret) {
    // Key drift: a 2FA-enabled admin's secret no longer decrypts. Surface it loudly either way.
    log.error("2FA-enabled admin has an undecryptable TOTP secret", { userId, failClosed: opts?.failClosed ?? false });
    if (opts?.failClosed) {
      // Destructive path: do NOT bypass the second factor. Block and force key remediation.
      return { ok: false, status: 503, error: "2FA chwilowo niedostępne (klucz szyfrowania) — napraw konfigurację klucza przed wykonaniem tej akcji" };
    }
    return { ok: true };
  }
  if (!verifyTotp(secret, String(code ?? ""), Date.now())) {
    return { ok: false, status: 401, error: "Wymagany aktualny kod 2FA" };
  }
  return { ok: true };
}
