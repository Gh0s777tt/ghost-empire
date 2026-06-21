import { describe, it, expect } from "vitest";
import { tenantSlugFromHost, resolveTenantSlug, hexToRgbTriplet, customDomainFromHost } from "@/lib/tenant-host";

describe("hexToRgbTriplet", () => {
  it("decodes a hex color with or without the hash", () => {
    expect(hexToRgbTriplet("#E50914")).toBe("229 9 20");
    expect(hexToRgbTriplet("00ff80")).toBe("0 255 128");
  });
  it("falls back to brand red on malformed input", () => {
    expect(hexToRgbTriplet("")).toBe("229 9 20");
    expect(hexToRgbTriplet("#abc")).toBe("229 9 20");
    expect(hexToRgbTriplet("red")).toBe("229 9 20");
    expect(hexToRgbTriplet("#12345g")).toBe("229 9 20");
  });
});

describe("tenantSlugFromHost", () => {
  const ROOT = "myapp.com";

  it("extracts a single-label subdomain as the tenant slug", () => {
    expect(tenantSlugFromHost("gh0st.myapp.com", ROOT)).toBe("gh0st");
    expect(tenantSlugFromHost("streamer-two.myapp.com", ROOT)).toBe("streamer-two");
  });

  it("returns null for apex and www (no tenant)", () => {
    expect(tenantSlugFromHost("myapp.com", ROOT)).toBeNull();
    expect(tenantSlugFromHost("www.myapp.com", ROOT)).toBeNull();
  });

  it("returns null for multi-label subdomains", () => {
    expect(tenantSlugFromHost("a.b.myapp.com", ROOT)).toBeNull();
  });

  it("returns null for hosts not under the root domain", () => {
    expect(tenantSlugFromHost("ghost-empire-web.vercel.app", ROOT)).toBeNull();
    expect(tenantSlugFromHost("localhost", ROOT)).toBeNull();
    expect(tenantSlugFromHost("evil-myapp.com", ROOT)).toBeNull(); // suffix without the dot must not match
  });

  it("is a no-op when no root domain is configured", () => {
    expect(tenantSlugFromHost("gh0st.myapp.com", undefined)).toBeNull();
    expect(tenantSlugFromHost("gh0st.myapp.com", "")).toBeNull();
  });

  it("handles empty / null hosts", () => {
    expect(tenantSlugFromHost(null, ROOT)).toBeNull();
    expect(tenantSlugFromHost(undefined, ROOT)).toBeNull();
    expect(tenantSlugFromHost("", ROOT)).toBeNull();
  });

  it("strips the port and is case-insensitive", () => {
    expect(tenantSlugFromHost("gh0st.myapp.com:3000", ROOT)).toBe("gh0st");
    expect(tenantSlugFromHost("GH0ST.MyApp.Com", ROOT)).toBe("gh0st");
  });
});

describe("customDomainFromHost", () => {
  it("normalizes apex / www to the same bare domain", () => {
    expect(customDomainFromHost("empire-forge.com")).toBe("empire-forge.com");
    expect(customDomainFromHost("www.empire-forge.com")).toBe("empire-forge.com");
  });
  it("strips port, protocol and path, and lowercases", () => {
    expect(customDomainFromHost("Empire-Forge.com:443")).toBe("empire-forge.com");
    expect(customDomainFromHost("https://empire-forge.com/path?x=1")).toBe("empire-forge.com");
    expect(customDomainFromHost("WWW.Empire-Forge.COM")).toBe("empire-forge.com");
  });
  it("returns null for empty / nullish hosts", () => {
    expect(customDomainFromHost(null)).toBeNull();
    expect(customDomainFromHost(undefined)).toBeNull();
    expect(customDomainFromHost("")).toBeNull();
  });
  it("matches what a request Host resolves to (write == read)", () => {
    // The admin stores the value via this same normalizer, so a request to either form resolves.
    const stored = customDomainFromHost("https://www.empire-forge.com/");
    expect(customDomainFromHost("empire-forge.com")).toBe(stored);
    expect(customDomainFromHost("www.empire-forge.com:443")).toBe(stored);
  });
});

describe("resolveTenantSlug", () => {
  const ROOT = "myapp.com";

  it("resolves the tenant strictly from the Host subdomain", () => {
    expect(resolveTenantSlug("gh0st.myapp.com", ROOT)).toBe("gh0st");
    expect(resolveTenantSlug("streamer-two.myapp.com", ROOT)).toBe("streamer-two");
    expect(resolveTenantSlug("gh0st.myapp.com:3000", ROOT)).toBe("gh0st");
  });

  it("returns null for apex / www / non-matching host (caller → default tenant)", () => {
    expect(resolveTenantSlug("myapp.com", ROOT)).toBeNull();
    expect(resolveTenantSlug("www.myapp.com", ROOT)).toBeNull();
    expect(resolveTenantSlug("ghost-empire-web.vercel.app", ROOT)).toBeNull();
    expect(resolveTenantSlug(null, ROOT)).toBeNull();
    expect(resolveTenantSlug(undefined, ROOT)).toBeNull();
  });

  it("does NOT trust a forgeable x-tenant-slug header (Host is authoritative)", () => {
    // The header is no longer a resolution input — only the Host matters, so a client
    // forging a tenant header (e.g. on apex, or on /api/* which bypasses the proxy)
    // cannot switch tenant context.
    expect(resolveTenantSlug("myapp.com", ROOT)).toBeNull();           // apex stays default
    expect(resolveTenantSlug("gh0st.myapp.com", ROOT)).toBe("gh0st");  // real subdomain wins
  });
});
