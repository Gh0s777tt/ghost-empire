// src/lib/tenant-scope.ts
// Phase 3 SCAFFOLD (design proposal) — tenant isolation for Prisma queries.
//
// Goal: instead of hand-writing `where: { tenantId }` on ~200 app queries (easy to
// forget → cross-tenant data leak), route app data access through a Prisma `$extends`
// client that injects the tenant filter automatically for the models we register.
//
// IMPORTANT — this is NOT yet wired into anything. The global `prisma` (lib/prisma.ts)
// stays UNSCOPED on purpose:
//   - the NextAuth adapter reads users by id across tenants (scoping it would break login);
//   - admin-of-admins / cross-tenant tooling needs the unscoped client.
// App requests will call `tenantScoped(tenantId)` for data access. TENANT_SCOPED_MODELS
// starts empty, so today this is a no-op; Phase 3 adds each model (with its tenantId
// column) to the set, one group at a time.
//
// ⚠️ KEY DESIGN DECISION — unique-by-id operations:
// Prisma's `where` for findUnique/update/delete/upsert accepts ONLY unique fields, so a
// plain `tenantId` filter can't be added there. We therefore treat those ops as
// UNSUPPORTED on scoped models and throw a clear error pointing callers to
// findFirst/updateMany/deleteMany. Rationale: a findUnique by a global id WITHOUT a
// tenant check is exactly the leak vector, so failing loud is safer than silently
// returning another tenant's row. Alternative for Phase 3 if needed: add tenantId to
// each model's compound unique constraints and inject it into the unique selector.
import { prisma } from "@/lib/prisma";

/**
 * Prisma model names (exactly as declared, e.g. "Event") that carry a `tenantId`
 * column and must be tenant-scoped. EMPTY today — Phase 3 populates it per model-group
 * as the column is added. While empty, `tenantScoped()` passes everything through.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  // Phase 3, e.g.: "Event", "ShopItem", "Transaction", "StreamDrop", "Achievement", ...
]);

const CREATE_OP = "create";
const CREATE_MANY_OPS = new Set(["createMany", "createManyAndReturn"]);
// Operations whose args carry a filterable, non-unique `where`.
const FILTERABLE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);
// Operations whose `where` is a UNIQUE selector — can't take a plain tenantId filter.
const UNIQUE_ARG_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);

export type TenantScopeResult =
  | { kind: "ok"; args: Record<string, unknown> }
  | { kind: "unsupported"; operation: string };

/**
 * Pure core (unit-tested): given an operation + its args, return the args with the
 * tenant filter merged in, or signal that the operation can't be tenant-scoped.
 * Never mutates the input. `create`/`createMany` get `tenantId` in `data`; filterable
 * reads/writes get it in `where`; unique-by-id ops are `unsupported`.
 */
export function tenantScopeArgs(
  operation: string,
  rawArgs: unknown,
  tenantId: string,
): TenantScopeResult {
  const args: Record<string, unknown> = { ...((rawArgs as Record<string, unknown>) ?? {}) };

  if (operation === CREATE_OP) {
    args.data = { ...((args.data as Record<string, unknown>) ?? {}), tenantId };
    return { kind: "ok", args };
  }
  if (CREATE_MANY_OPS.has(operation)) {
    const data = args.data;
    args.data = Array.isArray(data)
      ? data.map((row) => ({ ...((row as Record<string, unknown>) ?? {}), tenantId }))
      : { ...((data as Record<string, unknown>) ?? {}), tenantId };
    return { kind: "ok", args };
  }
  if (FILTERABLE_OPS.has(operation)) {
    args.where = { ...((args.where as Record<string, unknown>) ?? {}), tenantId };
    return { kind: "ok", args };
  }
  if (UNIQUE_ARG_OPS.has(operation)) {
    return { kind: "unsupported", operation };
  }
  // Unknown / non-model ops ($queryRaw, etc.) — leave untouched.
  return { kind: "ok", args };
}

/**
 * Returns a tenant-scoped Prisma client: every operation on a model in
 * TENANT_SCOPED_MODELS is auto-filtered to `tenantId`. Operations that can't be
 * filtered (findUnique/update/delete/upsert on a scoped model) throw — use
 * findFirst/updateMany/deleteMany instead. Models not in the set pass through.
 */
export function tenantScoped(tenantId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model)) return query(args);
          const scoped = tenantScopeArgs(operation, args, tenantId);
          if (scoped.kind === "unsupported") {
            throw new Error(
              `[tenant-scope] "${scoped.operation}" on ${model} cannot be tenant-filtered ` +
                "(its where accepts unique fields only). Use findFirst / updateMany / deleteMany, " +
                "or add tenantId to a compound unique. See src/lib/tenant-scope.ts.",
            );
          }
          return query(scoped.args);
        },
      },
    },
  });
}
