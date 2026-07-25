// src/lib/__tests__/donations-donationalerts.test.ts
import { describe, it, expect } from "vitest";
import {
  parseDaTimestamp,
  parseDaDonation,
  parseDaFeed,
  daDonationsUrl,
  daAuthorizeUrl,
  DA_SCOPES,
} from "@/lib/donations/donationalerts";
import { vendorSince, newestAt, selectFresh, CURSOR_GRACE_MS, MAX_CLOCK_SKEW_MS } from "@/lib/donations/cursor";

const ITEM = {
  id: 998877,
  username: "Ala",
  message: "GE-ABC234 leć dalej!",
  message_type: "text",
  amount: 25.5,
  currency: "PLN",
  is_shown: 1,
  created_at: "2026-07-20 18.30.05",
};

describe("parseDaTimestamp", () => {
  it("parses the vendor's dotted time format (new Date() cannot)", () => {
    // This is the shape in the API doc: the time part uses DOTS.
    expect(new Date("2026-07-20 18.30.05").getTime()).toBeNaN(); // proves the need for this parser
    const d = parseDaTimestamp("2026-07-20 18.30.05")!;
    expect(d.toISOString()).toBe("2026-07-20T18:30:05.000Z");
  });

  it("also accepts a colon/ISO variant, in case the vendor normalises it", () => {
    expect(parseDaTimestamp("2026-07-20 18:30:05")!.toISOString()).toBe("2026-07-20T18:30:05.000Z");
    expect(parseDaTimestamp("2026-07-20T18:30:05Z")!.toISOString()).toBe("2026-07-20T18:30:05.000Z");
  });

  it("returns null instead of substituting now — a wrong 'now' would poison the poll cursor", () => {
    for (const bad of [null, undefined, "", "nonsense", 42, {}]) {
      expect(parseDaTimestamp(bad)).toBeNull();
    }
  });
});

describe("parseDaDonation", () => {
  it("converts MAJOR units to minor per currency", () => {
    expect(parseDaDonation(ITEM)!.amountMinor).toBe(2550); // 25.50 PLN
    expect(parseDaDonation({ ...ITEM, amount: 1000, currency: "JPY" })!.amountMinor).toBe(1000); // 0 decimals
    expect(parseDaDonation({ ...ITEM, amount: 10, currency: "USD" })!.amountMinor).toBe(1000);
  });

  it("is ALWAYS unverified — only the credential holder may grant minting rights", () => {
    expect(parseDaDonation(ITEM)!.trust).toBe("unverified");
    expect(parseDaDonation({ ...ITEM, amount: 5000 })!.trust).toBe("unverified");
  });

  it("keeps the message (it carries the GE-code) and the donor nick", () => {
    const d = parseDaDonation(ITEM)!;
    expect(d.message).toContain("GE-ABC234");
    expect(d.donorName).toBe("Ala");
    expect(d.providerEventId).toBe("998877");
  });

  it("keeps an audio (TTS) donation — the code can still be in it", () => {
    expect(parseDaDonation({ ...ITEM, message_type: "audio" })).not.toBeNull();
  });

  it("drops rows it cannot value or trust", () => {
    expect(parseDaDonation({ ...ITEM, amount: 0 })).toBeNull();
    expect(parseDaDonation({ ...ITEM, amount: -5 })).toBeNull();
    expect(parseDaDonation({ ...ITEM, amount: "abc" })).toBeNull();
    expect(parseDaDonation({ ...ITEM, currency: "" })).toBeNull(); // no currency = fx must not guess
    expect(parseDaDonation({ ...ITEM, currency: undefined })).toBeNull();
    expect(parseDaDonation({ ...ITEM, amount: 90_000_000 })).toBeNull(); // int4 guard
    expect(parseDaDonation(null as unknown as Record<string, unknown>)).toBeNull();
  });

  it("drops ANY row without a usable timestamp, even when the vendor id is present", () => {
    // Stamping "now" here would make page 1 of history look like it arrived this second, and since
    // both the freshness cutoff and the stored cursor are timestamps, that replays history as live
    // auto-credited income. Failing closed is the only safe reading.
    expect(parseDaDonation({ ...ITEM, created_at: "nonsense" })).toBeNull();
    expect(parseDaDonation({ ...ITEM, created_at: undefined })).toBeNull();
    expect(parseDaDonation({ ...ITEM, id: undefined })).not.toBeNull(); // a real timestamp is enough
  });

  it("derives a STABLE synthetic id when only the timestamp is available", () => {
    const a = parseDaDonation({ ...ITEM, id: undefined })!;
    const b = parseDaDonation({ ...ITEM, id: undefined })!;
    expect(a.providerEventId).toBe(b.providerEventId);
    expect(a.providerEventId).toContain("donationalerts:syn:");
  });
});

describe("parseDaFeed", () => {
  it("handles the {data:[…]} envelope and a bare array, skipping bad rows", () => {
    expect(parseDaFeed({ data: [ITEM, { ...ITEM, amount: 0 }, ITEM] })).toHaveLength(2);
    expect(parseDaFeed([ITEM])).toHaveLength(1);
    expect(parseDaFeed(null)).toHaveLength(0);
    expect(parseDaFeed({ meta: { total: 0 } })).toHaveLength(0);
  });
});

describe("URL builders", () => {
  it("builds the donations page URL, never below page 1", () => {
    expect(daDonationsUrl()).toBe("https://www.donationalerts.com/api/v1/alerts/donations?page=1");
    expect(daDonationsUrl(3)).toContain("page=3");
    expect(daDonationsUrl(0)).toContain("page=1");
    expect(daDonationsUrl(-7)).toContain("page=1");
  });

  it("asks only for the scopes polling needs — not the push-stream grant", () => {
    expect(DA_SCOPES).toBe("oauth-user-show oauth-donation-index");
    expect(DA_SCOPES).not.toContain("subscribe");
  });

  it("puts the signed state and redirect into the authorize URL", () => {
    const u = new URL(daAuthorizeUrl("signed.state", "https://portal.example/api/auth/donationalerts/callback", "cid"));
    expect(u.origin + u.pathname).toBe("https://www.donationalerts.com/oauth/authorize");
    expect(u.searchParams.get("state")).toBe("signed.state");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("redirect_uri")).toBe("https://portal.example/api/auth/donationalerts/callback");
  });
});

describe("vendorSince — the clock-independent cursor (the reason this rail cannot replay history)", () => {
  it("returns null with no cursor yet, which means PRIME, do not ingest", () => {
    // The whole backfill guard rests on this: the vendor's page is always the most recent donations,
    // so ingesting it on first connect would replay history as live AUTO-CREDITED income. Returning
    // null makes the cron prime the cursor and ingest nothing — and needs no clock agreement at all.
    expect(vendorSince(null)).toBeNull();
  });

  it("compares vendor-time to vendor-time only, never against our clock", () => {
    // A vendor reporting local time can sit hours from our UTC. That is harmless as long as BOTH
    // sides of the comparison are its clock — which is exactly what this returns.
    const stored = new Date("2026-07-25T21:30:00Z"); // e.g. UTC+3 local reported as if UTC
    const since = vendorSince(stored)!;
    expect(since.getTime()).toBe(stored.getTime() - CURSOR_GRACE_MS);
  });

  it("keeps an overlap so a donation created mid-poll is not skipped", () => {
    const stored = new Date("2026-07-25T12:00:00Z");
    expect(vendorSince(stored)!.getTime()).toBeLessThan(stored.getTime());
  });
});

describe("newestAt — the cursor may never be wedged by an absurd timestamp", () => {
  const now = new Date("2026-07-25T12:00:00Z");
  const at = (iso: string) => ({ donatedAt: new Date(iso) });

  it("takes the newest believable timestamp", () => {
    const r = newestAt([at("2026-07-25T10:00:00Z"), at("2026-07-25T11:30:00Z")], now)!;
    expect(r.toISOString()).toBe("2026-07-25T11:30:00.000Z");
  });

  it("tolerates a real timezone offset (hours ahead is normal for a zone-less provider)", () => {
    const r = newestAt([at("2026-07-25T15:00:00Z")], now)!;
    expect(r.toISOString()).toBe("2026-07-25T15:00:00.000Z");
  });

  it("REJECTS a wildly future row — a cursor only moves forward, so one would stall the rail forever", () => {
    const r = newestAt([at("2026-07-25T11:00:00Z"), at("2126-07-20T18:30:05Z")], now)!;
    expect(r.toISOString()).toBe("2026-07-25T11:00:00.000Z");
    expect(newestAt([at("2126-07-20T18:30:05Z")], now)).toBeNull();
    expect(MAX_CLOCK_SKEW_MS).toBeGreaterThan(12 * 60 * 60 * 1000); // room for any real offset
  });

  it("returns null for an empty batch so the caller leaves the cursor alone", () => {
    expect(newestAt([], now)).toBeNull();
  });
});

describe("the two together: a second poll ingests only what is new", () => {
  it("drops what the previous poll already saw and keeps the rest", () => {
    const page = [
      { ...ITEM, id: 1, created_at: "2026-07-25 09.00.00" }, // long before the cursor
      { ...ITEM, id: 2, created_at: "2026-07-25 11.59.00" }, // inside the overlap window
      { ...ITEM, id: 3, created_at: "2026-07-25 12.05.00" }, // genuinely new
    ].map((i) => parseDaDonation(i)!);
    const since = vendorSince(new Date("2026-07-25T12:00:00Z"))!; // 11:30 after the grace window
    const fresh = selectFresh(page, since);
    expect(fresh.map((d) => d.providerEventId)).toEqual(["2", "3"]); // "1" is history
  });
});
