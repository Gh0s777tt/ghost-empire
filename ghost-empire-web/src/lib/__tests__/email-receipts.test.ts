// src/lib/__tests__/email-receipts.test.ts
import { describe, it, expect } from "vitest";
import { donationReceiptEmail } from "@/lib/email-receipts";
import { escapeHtml } from "@/lib/digest"; // receipts reuse the shared escaper

describe("escapeHtml", () => {
  it("escapes every HTML-significant char", () => {
    expect(escapeHtml(`<script>"x"&'y'`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;");
  });
  it("leaves ordinary text alone", () => {
    expect(escapeHtml("Ghost Empire")).toBe("Ghost Empire");
  });
});

describe("donationReceiptEmail", () => {
  const base = { brandName: "Neo Portal", tokenName: "Neo Coins", amount: 25, currency: "PLN", tokensGranted: 2500 };

  it("uses the TENANT brand + currency (white-label, never the founder's)", () => {
    const { subject, html } = donationReceiptEmail(base);
    expect(subject).toContain("Neo Portal");
    expect(html).toContain("Neo Portal");
    expect(html).toContain("Neo Coins");
    expect(html).not.toContain("Ghost Tokens");
    expect(html).not.toContain("GH0ST");
  });

  it("renders the amount and granted currency", () => {
    const { html } = donationReceiptEmail(base);
    expect(html).toContain("25.00 PLN");
    // NB: pl-PL does NOT group 4-digit numbers (minimumGroupingDigits: 2) → "2500", not "2 500".
    expect(html).toContain("2500 Neo Coins");
    // 5+ digits DO group, with a non-breaking space — normalize any space-ish char before asserting.
    const big = donationReceiptEmail({ ...base, tokensGranted: 25000 }).html.replace(/\s/g, " ");
    expect(big).toContain("25 000 Neo Coins");
  });

  it("renders the CHARGED currency verbatim — never relabelled as PLN (receipt integrity)", () => {
    const usd = donationReceiptEmail({ ...base, amount: 10, currency: "USD" });
    expect(usd.html).toContain("10.00 USD");
    expect(usd.html).not.toContain("PLN");
    // lowercase/odd input is normalized, not trusted into the markup
    expect(donationReceiptEmail({ ...base, currency: "eur" }).html).toContain("25.00 EUR");
    expect(donationReceiptEmail({ ...base, currency: "<b>x" }).html).not.toContain("<b>");
  });

  it("writes PL by default and EN when asked", () => {
    expect(donationReceiptEmail(base).html).toContain("Dziękujemy");
    const en = donationReceiptEmail({ ...base, locale: "en" });
    expect(en.html).toContain("Thank you");
    expect(en.subject).toContain("Thank you");
  });

  it("ESCAPES a tenant name containing markup (owner-set value cannot inject the mail)", () => {
    const { html, subject } = donationReceiptEmail({ ...base, brandName: `<img src=x onerror=alert(1)>`, tokenName: `A&B` });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("A&amp;B");
    expect(subject).not.toContain("<"); // header context stripped
  });

  it("never renders a negative granted amount", () => {
    const { html } = donationReceiptEmail({ ...base, tokensGranted: -5 });
    expect(html).not.toContain("-5");
    expect(html).toContain("0");
  });
});
