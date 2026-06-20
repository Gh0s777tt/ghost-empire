// src/lib/countries.ts
// Country flag for the profile (#540). Pure: an ISO-3166-1 alpha-2 code → its flag
// emoji (regional-indicator pair). The picker shows localized names via
// Intl.DisplayNames, so we only keep the code list here. Validation guards what the
// API stores. Curated to common countries — broad but not the full 249.

export const COUNTRY_CODES = [
  "AR", "AT", "AU", "BE", "BG", "BR", "CA", "CH", "CL", "CN", "CO", "CZ", "DE", "DK",
  "EE", "EG", "ES", "FI", "FR", "GB", "GR", "HK", "HR", "HU", "ID", "IE", "IL", "IN",
  "IS", "IT", "JP", "KR", "LT", "LU", "LV", "MA", "MX", "MY", "NG", "NL", "NO", "NZ",
  "PE", "PH", "PL", "PT", "RO", "RS", "RU", "SA", "SE", "SG", "SI", "SK", "TH", "TR",
  "TW", "UA", "US", "VN", "ZA",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

/** True when `code` is a known ISO-2 country code (case-insensitive). */
export function isCountryCode(code: string): boolean {
  return (COUNTRY_CODES as readonly string[]).includes(code.toUpperCase());
}

/** ISO-2 code → flag emoji. Returns "" for anything that isn't two ASCII letters. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  const cc = code.toUpperCase();
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)));
}
