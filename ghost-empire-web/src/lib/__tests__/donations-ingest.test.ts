// src/lib/__tests__/donations-ingest.test.ts
// Tests for THE invariant the donation layer rests on: what is allowed to mint currency.
// Pure gate only — the DB pipeline around it is covered by the route/integration level.
import { describe, it, expect } from "vitest";
import { mayMintDonation } from "@/lib/donations/ingest";
import { plnFromMinor } from "@/lib/donations/fx";

describe("mayMintDonation — the mint gate", () => {
  it("ALLOWS only a verified event with a known currency", () => {
    expect(mayMintDonation("verified", 25)).toBe(true);
  });

  it("REFUSES every unverified event — an open socket or generic webhook can never mint", () => {
    expect(mayMintDonation("unverified", 25)).toBe(false);
    expect(mayMintDonation("unverified", 1_000_000)).toBe(false);
  });

  it("REFUSES a verified event in an unknown currency (null = no rate; never guess one)", () => {
    expect(mayMintDonation("verified", null)).toBe(false);
    // end-to-end with the FX table: an unlisted code yields null, so it cannot mint
    expect(mayMintDonation("verified", plnFromMinor(10_000, "XYZ"))).toBe(false);
    // ...while a listed one can
    expect(mayMintDonation("verified", plnFromMinor(10_000, "EUR"))).toBe(true);
  });

  it("REFUSES a non-positive value", () => {
    expect(mayMintDonation("verified", 0)).toBe(false);
    expect(mayMintDonation("verified", -5)).toBe(false);
  });

  it("is strict about the trust literal (no truthiness shortcut)", () => {
    // @ts-expect-error — deliberately passing a bogus trust value
    expect(mayMintDonation("VERIFIED", 25)).toBe(false);
    // @ts-expect-error
    expect(mayMintDonation("", 25)).toBe(false);
    // @ts-expect-error
    expect(mayMintDonation(true, 25)).toBe(false);
  });
});
