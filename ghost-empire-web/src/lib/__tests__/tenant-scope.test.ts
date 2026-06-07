import { describe, it, expect } from "vitest";
import { tenantScopeArgs } from "@/lib/tenant-scope";

const T = "tenant_123";

describe("tenantScopeArgs", () => {
  it("injects tenantId into create data (preserving other fields)", () => {
    const r = tenantScopeArgs("create", { data: { name: "x" } }, T);
    expect(r).toEqual({ kind: "ok", args: { data: { name: "x", tenantId: T } } });
  });

  it("injects tenantId into each row of createMany (array)", () => {
    const r = tenantScopeArgs("createMany", { data: [{ a: 1 }, { a: 2 }] }, T);
    expect(r).toEqual({
      kind: "ok",
      args: { data: [{ a: 1, tenantId: T }, { a: 2, tenantId: T }] },
    });
  });

  it("injects tenantId into createMany single-object data", () => {
    const r = tenantScopeArgs("createMany", { data: { a: 1 } }, T);
    expect(r).toEqual({ kind: "ok", args: { data: { a: 1, tenantId: T } } });
  });

  it("merges tenantId into where for filterable ops (preserving conditions)", () => {
    for (const op of ["findFirst", "findMany", "count", "aggregate", "groupBy", "updateMany", "deleteMany"]) {
      const r = tenantScopeArgs(op, { where: { active: true } }, T);
      expect(r).toEqual({ kind: "ok", args: { where: { active: true, tenantId: T } } });
    }
  });

  it("adds a where even when none was provided", () => {
    const r = tenantScopeArgs("findMany", undefined, T);
    expect(r).toEqual({ kind: "ok", args: { where: { tenantId: T } } });
  });

  it("marks unique-by-id ops as unsupported (would leak across tenants otherwise)", () => {
    for (const op of ["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]) {
      expect(tenantScopeArgs(op, { where: { id: "1" } }, T)).toEqual({ kind: "unsupported", operation: op });
    }
  });

  it("passes unknown / raw ops through unchanged", () => {
    const r = tenantScopeArgs("$queryRaw", { foo: 1 }, T);
    expect(r).toEqual({ kind: "ok", args: { foo: 1 } });
  });

  it("does not mutate the caller's args", () => {
    const input = { where: { active: true } };
    tenantScopeArgs("findMany", input, T);
    expect(input).toEqual({ where: { active: true } }); // unchanged
  });
});
