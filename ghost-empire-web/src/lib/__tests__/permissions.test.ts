import { describe, it, expect } from "vitest";
import {
  hasPermission,
  MOD_PERMISSIONS,
  PERMISSION_GROUPS,
  type ModPermission,
} from "@/lib/permissions";

describe("hasPermission", () => {
  const base = { isAdmin: false, isModerator: false, modPermissions: [] as string[] };

  it("admins bypass every check (even with no explicit permissions)", () => {
    const admin = { ...base, isAdmin: true };
    for (const p of MOD_PERMISSIONS) {
      expect(hasPermission(admin, p.id)).toBe(true);
    }
  });

  it("admins are allowed even when not flagged as moderator", () => {
    expect(hasPermission({ isAdmin: true, isModerator: false, modPermissions: [] }, "ban_users")).toBe(true);
  });

  it("a non-admin non-moderator is always denied", () => {
    expect(hasPermission(base, "grant_tokens")).toBe(false);
  });

  it("a moderator is allowed only for permissions they hold", () => {
    const mod = { ...base, isModerator: true, modPermissions: ["grant_tokens", "view_audit"] };
    expect(hasPermission(mod, "grant_tokens")).toBe(true);
    expect(hasPermission(mod, "view_audit")).toBe(true);
    expect(hasPermission(mod, "ban_users")).toBe(false);
  });

  it("a moderator with an empty permission list is denied", () => {
    expect(hasPermission({ ...base, isModerator: true }, "manage_shop")).toBe(false);
  });
});

describe("MOD_PERMISSIONS / PERMISSION_GROUPS integrity", () => {
  it("every permission id is unique", () => {
    const ids = MOD_PERMISSIONS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every permission belongs to a defined group", () => {
    for (const p of MOD_PERMISSIONS) {
      expect(PERMISSION_GROUPS[p.group]).toBeDefined();
    }
  });

  it("every permission has a non-empty label and description", () => {
    for (const p of MOD_PERMISSIONS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.desc.length).toBeGreaterThan(0);
    }
  });

  it("every group has a label and a hex color", () => {
    for (const g of Object.values(PERMISSION_GROUPS)) {
      expect(g.label.length).toBeGreaterThan(0);
      expect(g.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("hasPermission accepts every declared permission id as a valid argument", () => {
    const admin = { isAdmin: true, isModerator: false, modPermissions: [] };
    const ids: ModPermission[] = MOD_PERMISSIONS.map((p) => p.id);
    for (const id of ids) {
      expect(hasPermission(admin, id)).toBe(true);
    }
  });
});
