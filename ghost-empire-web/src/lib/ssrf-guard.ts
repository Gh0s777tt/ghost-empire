// src/lib/ssrf-guard.ts
// SSRF guard for admin-configured outbound URLs (outgoing webhooks, #audit-H3). Blocks
// loopback / private / link-local / cloud-metadata destinations — both when the host is
// an IP literal AND after resolving a hostname (so a public name pointing at an internal
// IP is rejected too). The pure helpers are unit-tested; the async resolver needs DNS.
import { lookup } from "node:dns/promises";

/** Pure: is this an IPv4/IPv6 literal in a private / loopback / link-local / reserved range? */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 127) return true; // "this network" + loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (100.64/10)
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return true; // loopback / unspecified
  if (low.startsWith("::ffff:")) return isPrivateIp(low.slice(7)); // IPv4-mapped IPv6
  if (low.startsWith("fe80") || low.startsWith("fc") || low.startsWith("fd")) return true; // link-local + ULA
  return false;
}

/** Pure: hostnames to reject before any DNS lookup (localhost, metadata names, IP literals). */
export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "metadata.google.internal" || h.endsWith(".internal")) return true;
  return isPrivateIp(h); // host that IS an IP literal
}

/** Async: full validation — http(s) + host not blocked + every resolved IP is public. True = SAFE to fetch. */
export async function isSafeWebhookUrl(raw: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(host)) return false;
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0) return false;
    for (const a of addrs) if (isPrivateIp(a.address)) return false;
  } catch {
    return false; // unresolvable → refuse
  }
  return true;
}
