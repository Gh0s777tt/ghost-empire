// src/lib/auth-adapter.ts
// Tenant-aware NextAuth adapter (per-tenant viewer identity — see
// docs/PER-TENANT-IDENTITY.md). Wraps the stock @auth/prisma-adapter and overrides
// ONLY the four tenant-sensitive methods so the same provider identity (Twitch/
// Kick/YouTube/Google) yields a SEPARATE User per portal. Everything else (sessions,
// getUserById, updates) delegates to the base adapter unchanged.
//
// ⚠️ NOT wired into auth.ts yet. It is correct only once the Account unique is the
// per-tenant composite (Stage C). With the Stage-A global unique still in place,
// creating a second per-tenant account for an existing provider id would violate it,
// so wiring happens together with the unique flip — never before. This module is
// pre-positioned + unit-tested so Stage C is a small, reviewed switch.
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterUser, AdapterAccount } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

/**
 * Build the where-clause for resolving an account by provider identity, scoped to a
 * tenant. With a tenant: match THIS tenant's link or a legacy NULL-tenant link
 * (pre-backfill) — never another tenant's, so a fresh per-tenant user gets created
 * instead. Without a tenant (single-tenant fallback): behave globally, unchanged.
 * Pure → unit-tested directly.
 */
export function accountWhere(
  provider: string,
  providerAccountId: string,
  tenantId: string | null,
) {
  if (!tenantId) return { provider, providerAccountId };
  return { provider, providerAccountId, OR: [{ tenantId }, { tenantId: null }] };
}

export function tenantAwarePrismaAdapter(): Adapter {
  const base = PrismaAdapter(prisma) as Adapter;

  return {
    ...base,

    // READ: resolve the provider identity within the current tenant; self-heal a
    // legacy NULL-tenant account by adopting it into this tenant on first login.
    async getUserByAccount({ provider, providerAccountId }) {
      const tid = await currentTenantId();
      const account = await prisma.account.findFirst({
        where: accountWhere(provider, providerAccountId, tid),
        include: { user: true },
      });
      if (!account) return null;
      if (account.tenantId == null && tid) {
        await prisma.account
          .update({ where: { id: account.id }, data: { tenantId: tid } })
          .catch(() => {/* best-effort heal — login proceeds regardless */});
      }
      return account.user as unknown as AdapterUser;
    },

    // READ: email-based linking (allowDangerousEmailAccountLinking) must stay WITHIN
    // a portal, else signing into portal B would link onto your portal-A user.
    async getUserByEmail(email) {
      const tid = await currentTenantId();
      const user = await prisma.user.findFirst({
        where: { email, ...(tid ? { tenantId: tid } : {}) },
      });
      return (user as unknown as AdapterUser) ?? null;
    },

    // WRITE: delegate the insert to the base adapter (keeps its field handling), then
    // stamp the tenant before returning — so the row is tenant-scoped from creation,
    // before the createUser event or any follow-up read runs.
    async createUser(data) {
      const created = await base.createUser!(data);
      const tid = await currentTenantId();
      if (tid) {
        await prisma.user
          .update({ where: { id: created.id }, data: { tenantId: tid } })
          .catch(() => {/* the createUser event also stamps tenantId as a backstop */});
        (created as AdapterUser & { tenantId?: string }).tenantId = tid;
      }
      return created;
    },

    // WRITE: bind the freshly-linked account to the current tenant. The base insert
    // leaves tenantId NULL; we patch only that just-created NULL row (unique by
    // provider id within the tenant), never another tenant's link.
    async linkAccount(account) {
      const linked = await base.linkAccount!(account);
      const tid = await currentTenantId();
      if (tid) {
        await prisma.account
          .updateMany({
            where: { provider: account.provider, providerAccountId: account.providerAccountId, tenantId: null },
            data: { tenantId: tid },
          })
          .catch(() => {/* best-effort — the next login self-heals via getUserByAccount */});
      }
      return linked as AdapterAccount;
    },
  };
}
