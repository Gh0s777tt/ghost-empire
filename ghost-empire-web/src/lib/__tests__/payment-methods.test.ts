import { describe, it, expect } from "vitest";
import { maskIban, formatIban, cryptoUri, sepaQrPayload, isPaymentKind } from "@/lib/payment-methods";

describe("maskIban", () => {
  it("shows country code + last 4, dots the middle", () => {
    expect(maskIban("PL61109010140000071219812874")).toBe("PL •••• 2874");
  });
  it("ignores spaces in the input", () => {
    expect(maskIban("PL61 1090 1014 0000 0712 1981 2874")).toBe("PL •••• 2874");
  });
  it("leaves a too-short value unmasked", () => {
    expect(maskIban("PL1234")).toBe("PL1234");
  });
});

describe("formatIban", () => {
  it("groups into 4-char blocks", () => {
    expect(formatIban("PL61109010140000071219812874")).toBe("PL61 1090 1014 0000 0712 1981 2874");
  });
});

describe("cryptoUri", () => {
  it("builds a BIP-21 URI for known coins", () => {
    expect(cryptoUri("BTC", "bc1qxy")).toBe("bitcoin:bc1qxy");
    expect(cryptoUri("eth", "0xabc", 0.5)).toBe("ethereum:0xabc?amount=0.5");
  });
  it("returns the raw address for coins without a scheme", () => {
    expect(cryptoUri("USDT", "TveryLong")).toBe("TveryLong");
    expect(cryptoUri(null, "addr")).toBe("addr");
  });
});

describe("sepaQrPayload", () => {
  it("produces a valid EPC header + IBAN + name", () => {
    const p = sepaQrPayload("Jan Kowalski", "PL61 1090 1014 0000 0712 1981 2874");
    const lines = p.split("\n");
    expect(lines[0]).toBe("BCD");
    expect(lines[3]).toBe("SCT");
    expect(lines[5]).toBe("Jan Kowalski");
    expect(lines[6]).toBe("PL61109010140000071219812874");
    expect(lines[7]).toBe(""); // no amount
  });
  it("includes a EUR amount when given", () => {
    const p = sepaQrPayload("X", "DE89370400440532013000", 12.5);
    expect(p.split("\n")[7]).toBe("EUR12.50");
  });
});

describe("isPaymentKind", () => {
  it("accepts the three kinds, rejects others", () => {
    expect(isPaymentKind("crypto")).toBe(true);
    expect(isPaymentKind("bank")).toBe(true);
    expect(isPaymentKind("paypal")).toBe(false);
    expect(isPaymentKind(null)).toBe(false);
  });
});
