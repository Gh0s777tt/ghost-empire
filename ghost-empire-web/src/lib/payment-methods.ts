// src/lib/payment-methods.ts
// Pure helpers for the public support/tip page (#514). No I/O — masking, crypto
// deep-link URIs and the SEPA/EPC QR payload, all unit-testable. The DB reads live
// in the page/route; QR rendering uses these strings + the `qrcode` dep.

export const PAYMENT_KINDS = ["link", "crypto", "bank"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export function isPaymentKind(v: unknown): v is PaymentKind {
  return typeof v === "string" && (PAYMENT_KINDS as readonly string[]).includes(v);
}

// Known crypto networks → BIP-21-style URI scheme for a wallet-opening QR. Coins
// without a universal scheme (USDT/SOL/XMR/TON/TRX) fall back to the raw address.
const CRYPTO_URI_SCHEME: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  LTC: "litecoin",
  DOGE: "dogecoin",
  BCH: "bitcoincash",
};

/** Mask an IBAN/account number — country code + last 4, the rest dotted. */
export function maskIban(iban: string): string {
  const clean = iban.replace(/\s+/g, "");
  if (clean.length <= 6) return clean; // too short to mask meaningfully
  return `${clean.slice(0, 2)} •••• ${clean.slice(-4)}`;
}

/** Group an IBAN into 4-char blocks for readable display. */
export function formatIban(iban: string): string {
  return iban
    .replace(/\s+/g, "")
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

/**
 * Deep-link URI for a crypto-address QR: BIP-21 (`bitcoin:<addr>?amount=…`) for
 * coins that have a registered scheme, else the raw address (still scannable —
 * wallets accept a bare address). `amount` is optional.
 */
export function cryptoUri(network: string | null | undefined, address: string, amount?: number): string {
  const addr = address.trim();
  const scheme = network ? CRYPTO_URI_SCHEME[network.trim().toUpperCase()] : undefined;
  if (!scheme) return addr;
  return amount && amount > 0 ? `${scheme}:${addr}?amount=${amount}` : `${scheme}:${addr}`;
}

/**
 * EPC ("GiroCode" / SEPA) QR payload — scannable by EU/PL banking apps to prefill a
 * SEPA transfer. EPC only supports EUR; pass an amount only when it's a EUR account.
 * Layout: header, version, charset(UTF-8), id, BIC, name, IBAN, amount, purpose,
 * structured-ref, unstructured-ref.
 */
export function sepaQrPayload(name: string, iban: string, amount?: number, ref?: string): string {
  const cleanIban = iban.replace(/\s+/g, "").toUpperCase();
  const amt = amount && amount > 0 ? `EUR${amount.toFixed(2)}` : "";
  return [
    "BCD",
    "002",
    "1",
    "SCT",
    "", // BIC (optional in v2)
    name.trim().slice(0, 70),
    cleanIban,
    amt,
    "", // purpose
    "", // structured remittance
    (ref ?? "").trim().slice(0, 140), // unstructured remittance
  ].join("\n");
}
