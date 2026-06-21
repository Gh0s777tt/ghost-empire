// src/lib/shipping.ts
// Pure helpers for the shipping/contact PII profile (#audit3). The API route handles
// encryption (lib/crypto) + persistence; this file is the dependency-free
// normalize/validate logic (so it's unit-tested like the rest of lib/).

/** Fields stored ENCRYPTED at rest (via lib/crypto). `country` is handled separately
 *  (plaintext ISO-2, display only). */
export const SHIPPING_ENCRYPTED_FIELDS = [
  "fullName",
  "phone",
  "email",
  "addressLine",
  "city",
  "postalCode",
  "parcelLocker",
] as const;

export type ShippingField = (typeof SHIPPING_ENCRYPTED_FIELDS)[number];
export type ShippingInput = Partial<Record<ShippingField, string>> & { country?: string };

const LIMITS: Record<ShippingField, number> = {
  fullName: 120,
  phone: 40,
  email: 200,
  addressLine: 200,
  city: 100,
  postalCode: 20,
  parcelLocker: 120,
};

/** Trim + length-clamp each field; drop empties; normalize country to an ISO-2 code.
 *  Pure — never throws, ignores unknown keys. */
export function cleanShippingInput(raw: Record<string, unknown>): ShippingInput {
  const out: ShippingInput = {};
  for (const f of SHIPPING_ENCRYPTED_FIELDS) {
    const v = raw[f];
    if (typeof v === "string") {
      const t = v.trim().slice(0, LIMITS[f]);
      if (t) out[f] = t;
    }
  }
  if (typeof raw.country === "string") {
    const c = raw.country.trim().toUpperCase().slice(0, 2);
    if (/^[A-Z]{2}$/.test(c)) out.country = c;
  }
  return out;
}

/** True when the input carries at least one field worth storing. */
export function hasAnyShipping(input: ShippingInput): boolean {
  return SHIPPING_ENCRYPTED_FIELDS.some((f) => !!input[f]) || !!input.country;
}
