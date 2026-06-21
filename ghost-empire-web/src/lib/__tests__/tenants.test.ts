// src/lib/__tests__/tenants.test.ts
import { describe, it, expect } from "vitest";
import { validateTenantSlug, validateCustomDomain } from "../tenants";

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
