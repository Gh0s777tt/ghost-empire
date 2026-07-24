// src/lib/__tests__/tenants.test.ts
import { describe, it, expect } from "vitest";
import { validateTenantSlug, validateCustomDomain, maskBotSecret, canManageTenantBotSecret } from "../tenants";

describe("validateTenantSlug", () => {
  it("accepts clean kebab slugs", () => {
    expect(validateTenantSlug("neo-zone")).toBeNull();
    expect(validateTenantSlug("abc")).toBeNull();
    expect(validateTenantSlug("streamer123")).toBeNull();
  });
  it("rejects bad formats", () => {
    expect(validateTenantSlug("ab")).toBe("format");            // too short
    expect(validateTenantSlug("Neo-Zone")).toBe("format");      // uppercase
    expect(validateTenantSlug("-neo")).toBe("format");          // edge hyphen
    expect(validateTenantSlug("neo-")).toBe("format");
    expect(validateTenantSlug("neo--zone")).toBe("format");     // double hyphen
    expect(validateTenantSlug("a".repeat(33))).toBe("format");  // too long
    expect(validateTenantSlug("neo zone")).toBe("format");
  });
  it("rejects reserved subdomains", () => {
    expect(validateTenantSlug("www")).toBe("reserved");
    expect(validateTenantSlug("api")).toBe("reserved");
    expect(validateTenantSlug("admin")).toBe("reserved");
  });
});

describe("validateCustomDomain", () => {
  it("accepts real (already-normalized) domains", () => {
    expect(validateCustomDomain("empire-forge.com")).toBeNull();
    expect(validateCustomDomain("portal.streamer.gg")).toBeNull();
    expect(validateCustomDomain("a.io")).toBeNull();
  });
  it("rejects non-domains", () => {
    expect(validateCustomDomain("localhost")).toBe("format");        // no TLD
    expect(validateCustomDomain("empire-forge")).toBe("format");     // no dot
    expect(validateCustomDomain("-bad.com")).toBe("format");         // leading hyphen
    expect(validateCustomDomain("bad-.com")).toBe("format");         // trailing hyphen
    expect(validateCustomDomain("empire forge.com")).toBe("format"); // space
    expect(validateCustomDomain("empire.c")).toBe("format");         // 1-char TLD
    expect(validateCustomDomain("")).toBe("format");
  });
});

// Per-tenant bot secret: the value must never be readable back, so the hint is the ONLY
// thing the panel ever sees about a stored secret.
describe("maskBotSecret", () => {
  it("reveals only the last 4 characters", () => {
    expect(maskBotSecret("aaaaaaaaaaaaaaaaaaaaaaaaaaaaXk7q")).toBe("…Xk7q");
  });
  it("returns null when nothing is configured", () => {
    expect(maskBotSecret(null)).toBeNull();
    expect(maskBotSecret(undefined)).toBeNull();
    expect(maskBotSecret("")).toBeNull();
  });
  it("never echoes a short secret whole", () => {
    // Only reachable for a hand-written DB value — must still not disclose it.
    expect(maskBotSecret("abcd")).toBe("…");
    expect(maskBotSecret("ab")).toBe("…");
  });
  it("leaks at most 4 chars regardless of secret length", () => {
    const secret = "s".repeat(200) + "TAIL";
    const hint = maskBotSecret(secret)!;
    expect(hint.replace("…", "").length).toBe(4);
    expect(secret.includes(hint.replace("…", ""))).toBe(true);
  });
});

describe("canManageTenantBotSecret", () => {
  const TENANT = { id: "t-a", ownerUserId: "owner-a" };
  const admin = (over: Partial<Parameters<typeof canManageTenantBotSecret>[0]> = {}) => ({
    userId: "u1", tenantId: "t-a", isAdmin: true, isPlatformOwner: false, ...over,
  });

  it("lets the portal's own owner manage it (from any host)", () => {
    expect(canManageTenantBotSecret(admin({ userId: "owner-a", tenantId: "t-other" }), TENANT)).toBe(true);
  });
  it("lets an admin of THIS portal manage it", () => {
    expect(canManageTenantBotSecret(admin(), TENANT)).toBe(true);
  });
  it("lets the platform owner manage any portal", () => {
    expect(canManageTenantBotSecret(admin({ userId: "po", tenantId: null, isAdmin: false, isPlatformOwner: true }), TENANT)).toBe(true);
  });
  it("refuses an admin of a DIFFERENT portal", () => {
    expect(canManageTenantBotSecret(admin({ tenantId: "t-b" }), TENANT)).toBe(false);
  });
  it("refuses a legacy admin with no tenant of their own", () => {
    // requireAdmin() alone lets a NULL-tenantId account administer any host — it must not
    // hand out a credential that authenticates a bot against another streamer's economy.
    expect(canManageTenantBotSecret(admin({ tenantId: null }), TENANT)).toBe(false);
  });
  it("refuses a non-admin even on their own portal", () => {
    expect(canManageTenantBotSecret(admin({ isAdmin: false }), TENANT)).toBe(false);
  });
  it("does not treat an unowned portal as owned by a null-id caller", () => {
    const unowned = { id: "t-a", ownerUserId: null };
    expect(canManageTenantBotSecret(admin({ tenantId: null }), unowned)).toBe(false);
    expect(canManageTenantBotSecret(admin({ tenantId: "t-a" }), unowned)).toBe(true);
  });
});
