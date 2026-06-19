import { describe, it, expect } from "vitest";
import { accountWhere } from "@/lib/auth-adapter";

// The single most important correctness rule of the per-tenant identity refactor:
// how a provider identity is resolved to an account WITHIN a tenant. (The DB-touching
// adapter methods are validated on staging per docs/PER-TENANT-IDENTITY.md — mocking
// them here would prove nothing about real multi-subdomain login.)
describe("accountWhere", () => {
  it("scopes to the current tenant OR a legacy NULL-tenant link", () => {
    expect(accountWhere("twitch", "123", "tenantA")).toEqual({
      provider: "twitch",
      providerAccountId: "123",
      OR: [{ tenantId: "tenantA" }, { tenantId: null }],
    });
  });

  it("never matches another tenant's link (only current + legacy-null are allowed)", () => {
    const w = accountWhere("twitch", "123", "tenantA") as { OR: Array<{ tenantId: string | null }> };
    const allowed = w.OR.map((c) => c.tenantId);
    expect(allowed).toContain("tenantA");
    expect(allowed).toContain(null);
    expect(allowed).not.toContain("tenantB");
  });

  it("falls back to a GLOBAL match when there is no tenant (single-tenant / fallback)", () => {
    expect(accountWhere("twitch", "123", null)).toEqual({
      provider: "twitch",
      providerAccountId: "123",
    });
  });
});
