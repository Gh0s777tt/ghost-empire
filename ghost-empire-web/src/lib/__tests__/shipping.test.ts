import { describe, it, expect } from "vitest";
import { cleanShippingInput, hasAnyShipping } from "@/lib/shipping";

describe("cleanShippingInput", () => {
  it("trims and drops empty fields", () => {
    const out = cleanShippingInput({ fullName: "  Jan Kowalski  ", phone: "   ", email: "" });
    expect(out.fullName).toBe("Jan Kowalski");
    expect(out.phone).toBeUndefined();
    expect(out.email).toBeUndefined();
  });

  it("length-clamps per field", () => {
    const out = cleanShippingInput({ city: "x".repeat(500), postalCode: "y".repeat(500) });
    expect(out.city?.length).toBe(100);
    expect(out.postalCode?.length).toBe(20);
  });

  it("normalizes country to an uppercase ISO-2 code", () => {
    expect(cleanShippingInput({ country: "pl" }).country).toBe("PL");
    expect(cleanShippingInput({ country: "  de " }).country).toBe("DE");
  });

  it("rejects malformed country codes", () => {
    expect(cleanShippingInput({ country: "x" }).country).toBeUndefined(); // too short
    expect(cleanShippingInput({ country: "1a" }).country).toBeUndefined(); // not letters
  });

  it("ignores non-string values and unknown keys", () => {
    expect(cleanShippingInput({ fullName: 123, addressLine: null, foo: "bar" })).toEqual({});
  });
});

describe("hasAnyShipping", () => {
  it("is true when any encrypted field is present", () => {
    expect(hasAnyShipping({ addressLine: "ul. Testowa 1" })).toBe(true);
  });
  it("is true when only country is present", () => {
    expect(hasAnyShipping({ country: "PL" })).toBe(true);
  });
  it("is false for an empty input", () => {
    expect(hasAnyShipping({})).toBe(false);
  });
});
