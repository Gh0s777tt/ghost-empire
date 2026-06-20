import { describe, it, expect } from "vitest";
import { isPrivateIp, isBlockedHostname } from "@/lib/ssrf-guard";

describe("isPrivateIp", () => {
  it("flags loopback / private / link-local / metadata IPv4", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.4.4", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });
  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "100.63.0.1", "151.101.1.69"]) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });
  it("handles IPv6 loopback / ULA / link-local / mapped", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it("blocks localhost, metadata, internal, IP literals", () => {
    for (const h of ["localhost", "foo.localhost", "metadata.google.internal", "x.internal", "127.0.0.1", "169.254.169.254", "10.1.2.3", ""]) {
      expect(isBlockedHostname(h)).toBe(true);
    }
  });
  it("allows normal public hostnames", () => {
    for (const h of ["discord.com", "hooks.zapier.com", "example.org", "8.8.8.8".replace("8.8.8.8", "api.github.com")]) {
      expect(isBlockedHostname(h)).toBe(false);
    }
  });
});
