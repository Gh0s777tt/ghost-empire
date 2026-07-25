// src/lib/donations/kofi.ts
// Ko-fi adapter (#donation-layer). Pure payload translation — no I/O, so it is unit-tested.
//
// Ko-fi is the cleanest integration shape available: the STREAMER pastes our webhook URL into their
// own Ko-fi dashboard (ko-fi.com/manage/webhooks) and Ko-fi includes a per-account
// `verification_token` in every payload. We compare that token against the value the streamer saved
// with us, which is what makes Ko-fi events `verified` (i.e. allowed to mint) — no OAuth app, no
// partner approval, fully self-serve per tenant.
//
// Payload note: Ko-fi POSTs `application/x-www-form-urlencoded` with a single field `data`
// containing the JSON — the route unwraps that before calling here.
import { normalizeCurrency, clampText, syntheticExternalId, type NormalizedDonation } from "./types";
import { minorFromMajor } from "./fx";

/** The subset of Ko-fi's payload we rely on. Everything is optional — it is remote input. */
export type KofiPayload = {
  verification_token?: unknown;
  message_id?: unknown;
  type?: unknown; // "Donation" | "Subscription" | "Commission" | "Shop Order"
  is_public?: unknown;
  from_name?: unknown;
  message?: unknown;
  amount?: unknown; // decimal STRING, e.g. "3.00"
  currency?: unknown;
  timestamp?: unknown; // ISO
  kofi_transaction_id?: unknown;
};

export type KofiParse =
  | { ok: true; donation: NormalizedDonation }
  | { ok: false; reason: "bad_payload" | "no_amount" | "unsupported_type" };

/** Ko-fi event types we treat as a donation. Shop orders are excluded: they are merchandise
 *  fulfilment, not a tip, and crediting them would double-count against the shop. */
const DONATION_TYPES = new Set(["donation", "subscription", "commission"]);

/**
 * Translate a Ko-fi webhook payload into the normalized event.
 *
 * Returns the event as `unverified`. The ROUTE upgrades it to `verified` after comparing
 * `verification_token` against the tenant's stored secret — so the trust decision lives in exactly
 * one place and a future caller of this function cannot accidentally obtain minting rights.
 *
 * @remarks unit-tested in `__tests__/donations-kofi.test.ts`.
 */
export function parseKofi(payload: KofiPayload): KofiParse {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "bad_payload" };

  const type = String(payload.type ?? "donation").trim().toLowerCase();
  if (!DONATION_TYPES.has(type)) return { ok: false, reason: "unsupported_type" };

  const currency = normalizeCurrency(payload.currency);
  // Currency-aware: "1000" JPY is 1000 minor units, not 100000 (see fx.currencyDecimals).
  const amountMinor = minorFromMajor(payload.amount, currency);
  if (amountMinor <= 0) return { ok: false, reason: "no_amount" };
  const donorName = clampText(payload.from_name, 200) ?? "Anon";
  // Ko-fi lets the donor hide the message; only a public message can carry a GE-code we may act on.
  const isPublic = payload.is_public === true || payload.is_public === "true";
  const message = isPublic ? clampText(payload.message, 2000) : null;

  const ts = typeof payload.timestamp === "string" ? new Date(payload.timestamp) : new Date();
  const donatedAt = Number.isNaN(ts.getTime()) ? new Date() : ts;

  // Prefer Ko-fi's own ids for idempotency; fall back to a deterministic synthetic one.
  const providerEventId =
    clampText(payload.message_id, 180) ??
    clampText(payload.kofi_transaction_id, 180) ??
    syntheticExternalId("kofi", { donorName, amountMinor, currency, donatedAt });

  return {
    ok: true,
    donation: {
      provider: "kofi",
      providerEventId,
      donorName,
      message,
      amountMinor,
      currency,
      donatedAt,
      // ALWAYS unverified here. The route stamps "verified" only AFTER the token check, so a
      // future caller of parseKofi cannot obtain a mint-authorized event by accident.
      trust: "unverified",
      raw: payload,
    },
  };
}
