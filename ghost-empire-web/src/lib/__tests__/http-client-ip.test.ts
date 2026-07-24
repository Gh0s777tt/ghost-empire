// QA: client-IP extraction (src/lib/http.ts) — the security-critical part.
// These are IP-keyed rate-limit / audit-log inputs, so the invariant under test is:
// a client-supplied, spoofable value (raw left-most X-Forwarded-For) must NEVER win
// over a proxy-set trusted header, otherwise an attacker rotates XFF to mint unlimited
// rate-limit buckets and forge audit-log IPs. Pure logic, no DB/network (repo convention).
import { describe, it, expect } from "vitest";
import { clientIp, clientIpOrNull } from "@/lib/http";

/** Build the `{ headers }` shape the http helpers accept from a plain header map. */
const req = (h: Record<string, string>) => ({ headers: new Headers(h) });

describe("clientIp / clientIpOrNull — trusted-header precedence", () => {
  it("ignores a spoofed left-most XFF when Vercel's trusted x-real-ip is present", () => {
    // The attack: attacker sends X-Forwarded-For: 1.2.3.4; Vercel sets x-real-ip to the
    // true edge-observed client IP. The trusted header must win.
    const ip = clientIp(
      req({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "9.9.9.9" }),
    );
    expect(ip).toBe("9.9.9.9");
  });

  it("prefers x-real-ip over x-vercel-forwarded-for and cf-connecting-ip", () => {
    const ip = clientIp(
      req({
        "x-real-ip": "10.0.0.1",
        "x-vercel-forwarded-for": "10.0.0.2",
        "cf-connecting-ip": "10.0.0.3",
        "x-forwarded-for": "1.2.3.4",
      }),
    );
    expect(ip).toBe("10.0.0.1");
  });

  it("falls back to x-vercel-forwarded-for (last hop) when x-real-ip is absent", () => {
    const ip = clientIp(
      req({ "x-vercel-forwarded-for": "spoofed, 9.9.9.9", "x-forwarded-for": "1.2.3.4" }),
    );
    // Even the Vercel header is read right-most so a client-injected left entry can't win.
    expect(ip).toBe("9.9.9.9");
  });

  it("falls back to cf-connecting-ip before raw XFF", () => {
    const ip = clientIp(req({ "cf-connecting-ip": "8.8.8.8", "x-forwarded-for": "1.2.3.4" }));
    expect(ip).toBe("8.8.8.8");
  });
});

describe("clientIp / clientIpOrNull — X-Forwarded-For last-resort handling", () => {
  it("takes the RIGHT-most hop of XFF, never the spoofable left-most", () => {
    // Chain: client-supplied left, trusted-proxy-appended right. We must read the right.
    const ip = clientIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.9" }));
    expect(ip).toBe("203.0.113.9");
  });

  it("returns the sole XFF entry when there is only one hop", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("skips trailing empty entries and trims whitespace", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4,  203.0.113.9  , " }))).toBe("203.0.113.9");
  });

  it("rotating the left-most XFF cannot change the resolved IP (bucket-spoof guard)", () => {
    // The core of the vulnerability: two requests that differ only in the attacker-controlled
    // left-most XFF entry must resolve to the SAME IP so they share one rate-limit bucket.
    const a = clientIp(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }));
    const b = clientIp(req({ "x-forwarded-for": "2.2.2.2, 203.0.113.9" }));
    expect(a).toBe(b);
    expect(a).toBe("203.0.113.9");
  });
});

describe("clientIp / clientIpOrNull — empty / missing", () => {
  it('clientIp falls back to "unknown" when no IP header is present', () => {
    expect(clientIp(req({}))).toBe("unknown");
  });

  it("clientIpOrNull returns null when no IP header is present", () => {
    expect(clientIpOrNull(req({}))).toBeNull();
  });

  it("clientIpOrNull returns null when XFF is present but blank", () => {
    expect(clientIpOrNull(req({ "x-forwarded-for": " , " }))).toBeNull();
  });
});
