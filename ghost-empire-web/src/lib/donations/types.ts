// src/lib/donations/types.ts
// The ONE normalized donation event every provider is translated into (#donation-layer).
//
// WHY THIS EXISTS: before this, the same money-in pipeline was hand-copied FOUR times (Streamlabs
// poll, PayMedia webhook, YouTube super chats, admin manual match) and the copies had already
// diverged — that is exactly how three of the four rails ended up minting GT with no cap and with
// three different PLN rates. Every new provider (Ko-fi, DonationAlerts, Tipply, …) goes through
// this type and lib/donations/ingest.ts instead of growing a fifth copy.
//
// Pure types + pure helpers only — no I/O, so this file is safe to import anywhere.

/**
 * How much we trust that the event is real, which decides whether it may MINT currency.
 *
 * - `verified` — authenticity is cryptographically or credential-established: an HMAC/token-signed
 *   webhook (Ko-fi, PayMedia) or a call we made ourselves with the tenant's own OAuth/API
 *   credential (Streamlabs, DonationAlerts, StreamElements). May mint.
 * - `unverified` — the payload is plausible but unauthenticated: an open socket keyed only by a
 *   capability id (Tipply's alert socket), or a generic incoming webhook wired through
 *   Zapier/Make/n8n. MUST NOT mint on its own; it is persisted for the streamer to confirm in the
 *   existing reconciliation queue (which already mints on approval).
 *
 * Anything that mints without a human must be `verified`. When in doubt, use `unverified` —
 * a donation that shows up for review is recoverable; minted currency is not.
 */
export type DonationTrust = "verified" | "unverified";

/** Providers we can ingest from. `custom` is the generic incoming-webhook adapter. */
export type DonationProvider =
  | "streamlabs"
  | "paymedia"
  | "youtube"
  | "kofi"
  | "donationalerts"
  | "streamelements"
  | "tipeee"
  | "tipply"
  | "custom";

/** A donation event, normalized. Amounts are MINOR units (grosze/cents) to avoid float drift. */
export type NormalizedDonation = {
  provider: DonationProvider;
  /** Provider's own stable id for this donation — the idempotency key. Required: without a stable
   *  id we cannot promise "never double-credit", so an adapter that has none must synthesize a
   *  deterministic one (see `syntheticExternalId`). */
  providerEventId: string;
  /** Display name the donor gave on the provider. Never trusted for identity. */
  donorName: string;
  /** Donor's message — the channel that can carry our GE-code, hence how a donation gets credited. */
  message: string | null;
  /** Amount actually charged, in minor units of `currency`. */
  amountMinor: number;
  /** ISO code as charged (PLN, EUR, USD…). Never pre-converted by the adapter. */
  currency: string;
  donatedAt: Date;
  trust: DonationTrust;
  /** Optional: provider already told us which of OUR users this is (e.g. an id we round-tripped). */
  knownUserId?: string | null;
  /** Free-form provider payload kept for debugging/reconciliation. Never rendered to viewers. */
  raw?: unknown;
};

/** `source` value stored on the Donation row — keeps the existing convention (`"streamlabs"`, …). */
export function donationSource(provider: DonationProvider): string {
  return provider;
}

/**
 * Deterministic id for providers that expose no stable event id, so retries still dedupe.
 * Built from the fields a genuine duplicate would share. NOT a security measure — two genuinely
 * distinct donations with identical name+amount+timestamp collapse into one, which is the safe
 * direction (under-credit, reviewable) rather than double-credit.
 */
export function syntheticExternalId(provider: DonationProvider, parts: {
  donorName: string;
  amountMinor: number;
  currency: string;
  donatedAt: Date;
}): string {
  const stamp = Math.floor(parts.donatedAt.getTime() / 1000);
  const name = parts.donorName.trim().toLowerCase().slice(0, 40);
  return `${provider}:syn:${stamp}:${parts.amountMinor}${parts.currency.toUpperCase()}:${name}`;
}

/** Namespaced external id, so two providers can never collide on the unique index. */
export function externalIdFor(provider: DonationProvider, providerEventId: string): string {
  const id = String(providerEventId).trim().slice(0, 180);
  return id.startsWith(`${provider}:`) ? id : `${provider}:${id}`;
}

/** Coerce anything provider-shaped into a safe positive integer of minor units (0 when nonsense). */
export function toMinor(value: unknown, opts: { alreadyMinor?: boolean } = {}): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const minor = opts.alreadyMinor ? n : n * 100;
  if (minor > Number.MAX_SAFE_INTEGER) return 0;
  return Math.round(minor);
}

/** Normalize a currency code; defaults to PLN (the platform's base) when absent/garbage. */
export function normalizeCurrency(raw: unknown): string {
  const s = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z]{3,8}$/.test(s) ? s : "PLN";
}

/** Clamp provider-supplied text for storage (and so a hostile payload can't bloat a row). */
export function clampText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return s ? s.slice(0, max) : null;
}
