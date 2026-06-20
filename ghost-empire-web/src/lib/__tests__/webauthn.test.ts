import { describe, it, expect } from "vitest";
import { rpIdFromHost, originFromHeaders, isSecureContext, sanitizeTransports } from "@/lib/webauthn";

describe("rpIdFromHost", () => {
  it("strips the port", () => {
    expect(rpIdFromHost("localhost:3000")).toBe("localhost");
    expect(rpIdFromHost("ghost-empire-web.vercel.app:443")).toBe("ghost-empire-web.vercel.app");
  });
  it("passes a bare hostname through", () => {
    expect(rpIdFromHost("ghost-empire-web.vercel.app")).toBe("ghost-empire-web.vercel.app");
    expect(rpIdFromHost("tenant.example.com")).toBe("tenant.example.com");
  });
  it("falls back to localhost when host is missing", () => {
    expect(rpIdFromHost(null)).toBe("localhost");
    expect(rpIdFromHost(undefined)).toBe("localhost");
    expect(rpIdFromHost("")).toBe("localhost");
  });
});

describe("originFromHeaders", () => {
  it("uses the forwarded proto when given", () => {
    expect(originFromHeaders("example.com", "https")).toBe("https://example.com");
  });
  it("defaults localhost to http and everything else to https", () => {
    expect(originFromHeaders("localhost:3000", null)).toBe("http://localhost:3000");
    expect(originFromHeaders("127.0.0.1:3000", undefined)).toBe("http://127.0.0.1:3000");
    expect(originFromHeaders("example.com", undefined)).toBe("https://example.com");
  });
});

describe("isSecureContext", () => {
  it("is true only for https origins", () => {
    expect(isSecureContext("https://example.com")).toBe(true);
    expect(isSecureContext("http://localhost:3000")).toBe(false);
    expect(isSecureContext("")).toBe(false);
  });
});

describe("sanitizeTransports", () => {
  it("keeps only known transports, as CSV", () => {
    expect(sanitizeTransports(["internal", "hybrid"])).toBe("internal,hybrid");
    expect(sanitizeTransports(["usb", "nfc", "ble"])).toBe("usb,nfc,ble");
  });
  it("drops unknown / non-string entries", () => {
    expect(sanitizeTransports(["internal", "evil", 5, null])).toBe("internal");
    expect(sanitizeTransports(["nope", "alsonope"])).toBeNull();
  });
  it("returns null for non-arrays", () => {
    for (const x of [null, undefined, "internal", 42, {}]) expect(sanitizeTransports(x)).toBeNull();
  });
});
