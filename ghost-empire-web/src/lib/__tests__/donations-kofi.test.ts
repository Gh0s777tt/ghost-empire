// src/lib/__tests__/donations-kofi.test.ts
import { describe, it, expect } from "vitest";
import { parseKofi } from "@/lib/donations/kofi";

const base = {
  verification_token: "tok",
  message_id: "msg-1",
  type: "Donation",
  is_public: true,
  from_name: "Ala",
  message: "GE-ABC234 dzięki!",
  amount: "25.00",
  currency: "PLN",
  timestamp: "2026-07-20T10:00:00Z",
};

describe("parseKofi", () => {
  it("translates a normal donation", () => {
    const r = parseKofi(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.donation).toMatchObject({
      provider: "kofi",
      providerEventId: "msg-1",
      donorName: "Ala",
      amountMinor: 2500,
      currency: "PLN",
    });
    expect(r.donation.message).toContain("GE-ABC234");
    expect(r.donation.donatedAt.toISOString()).toBe("2026-07-20T10:00:00.000Z");
  });

  it("NEVER self-authorizes: the adapter always returns unverified (the route stamps verified)", () => {
    const r = parseKofi(base);
    expect(r.ok && r.donation.trust).toBe("unverified");
    // even with a token present in the payload — the adapter does not check it, so it must not trust it
    const withToken = parseKofi({ ...base, verification_token: "anything" });
    expect(withToken.ok && withToken.donation.trust).toBe("unverified");
  });

  it("is currency-aware on the amount (JPY has no minor units)", () => {
    const jpy = parseKofi({ ...base, amount: "1000", currency: "JPY" });
    expect(jpy.ok && jpy.donation.amountMinor).toBe(1000); // ¥1000, not 100000
  });

  it("accepts subscriptions and commissions, rejects shop orders (not a tip)", () => {
    expect(parseKofi({ ...base, type: "Subscription" }).ok).toBe(true);
    expect(parseKofi({ ...base, type: "Commission" }).ok).toBe(true);
    const shop = parseKofi({ ...base, type: "Shop Order" });
    expect(shop).toEqual({ ok: false, reason: "unsupported_type" });
  });

  it("DROPS a private message — a hidden message must not carry a code we act on", () => {
    const r = parseKofi({ ...base, is_public: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.donation.message).toBeNull();
  });

  it("rejects a missing/zero/garbage amount instead of minting from it", () => {
    for (const amount of [undefined, "0", "-5", "abc", ""]) {
      expect(parseKofi({ ...base, amount }).ok).toBe(false);
    }
  });

  it("defaults a junk currency to PLN rather than trusting it", () => {
    const r = parseKofi({ ...base, currency: "!!" });
    expect(r.ok && r.donation.currency).toBe("PLN");
  });

  it("falls back to the transaction id, then to a deterministic synthetic id", () => {
    const noMsgId = parseKofi({ ...base, message_id: undefined, kofi_transaction_id: "tx-9" });
    expect(noMsgId.ok && noMsgId.donation.providerEventId).toBe("tx-9");

    const neither = parseKofi({ ...base, message_id: undefined, kofi_transaction_id: undefined });
    const again = parseKofi({ ...base, message_id: undefined, kofi_transaction_id: undefined });
    expect(neither.ok && again.ok).toBe(true);
    if (neither.ok && again.ok) {
      expect(neither.donation.providerEventId).toBe(again.donation.providerEventId); // retry dedupes
      expect(neither.donation.providerEventId).toContain("kofi:syn:");
    }
  });

  it("survives a hostile/empty payload", () => {
    expect(parseKofi(null as unknown as Record<string, unknown>).ok).toBe(false);
    expect(parseKofi({}).ok).toBe(false);
    const long = parseKofi({ ...base, from_name: "x".repeat(500), message: "y".repeat(5000) });
    expect(long.ok).toBe(true);
    if (long.ok) {
      expect(long.donation.donorName).toHaveLength(200);
      expect(long.donation.message).toHaveLength(2000);
    }
  });
});
