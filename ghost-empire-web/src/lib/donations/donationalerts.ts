// src/lib/donations/donationalerts.ts
// DonationAlerts adapter (#donation-layer). Pure payload/URL translation — no I/O in the exported
// parsers, so they are unit-tested; the two network calls live at the bottom and are thin.
//
// DonationAlerts is the one remaining provider that MAY MINT automatically, and that is the whole
// reason this file is careful. Unlike Ko-fi (a webhook we authenticate with a shared token) or
// Tipply (an unauthenticated public endpoint), here WE hold an OAuth credential the streamer granted
// us and we read their own donation list over TLS from the vendor. That chain establishes
// authenticity, so events arrive as `verified` — see the trust gate in `ingest.ts`.
//
// Contract, from the vendor's own API doc (donationalerts.com/apidoc) rather than memory:
//   authorize  GET  https://www.donationalerts.com/oauth/authorize
//   token      POST https://www.donationalerts.com/oauth/token   (also grant_type=refresh_token)
//   donations  GET  https://www.donationalerts.com/api/v1/alerts/donations   (Bearer, ?page=N)
//   item fields: id · username · message · message_type("text"|"audio") · amount · currency
//                · is_shown · created_at · shown_at
//
// TWO SHAPES THAT BITE, both handled here and pinned by tests:
//  1. `created_at` is `YYYY-MM-DD HH.MM.SS` — the time part is separated by DOTS, not colons, so
//     `new Date(raw)` yields Invalid Date. It is also vendor-local time with no zone marker.
//  2. `amount` is in MAJOR units (25.5), not minor — it goes through `minorFromMajor` so that a
//     zero-decimal currency (JPY, KRW) is not inflated 100×.
import { clampText, syntheticExternalId, type NormalizedDonation } from "./types";
import { minorFromMajor, MAX_AMOUNT_MINOR } from "./fx";
import { httpFetch, jsonOrThrow } from "@/lib/http";

const OAUTH_AUTHORIZE = "https://www.donationalerts.com/oauth/authorize";
const OAUTH_TOKEN = "https://www.donationalerts.com/oauth/token";
const DONATIONS = "https://www.donationalerts.com/api/v1/alerts/donations";

/**
 * Only what polling needs. `oauth-donation-subscribe` (the Centrifugo push stream) is deliberately
 * NOT requested: it buys latency we do not need on a serverless cron and widens the grant.
 */
export const DA_SCOPES = "oauth-user-show oauth-donation-index";

/** One item of the donations response. Everything optional — it is remote input. */
export type DonationAlertsItem = {
  id?: unknown;
  username?: unknown;
  message?: unknown;
  message_type?: unknown;
  amount?: unknown;
  currency?: unknown;
  is_shown?: unknown;
  created_at?: unknown;
};

/** The OAuth token response we care about. */
export type DaTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

/** Where to send the streamer to grant access. `state` is the signed, provider-bound CSRF state. */
export function daAuthorizeUrl(state: string, redirectUri: string, clientId = process.env.DONATIONALERTS_CLIENT_ID ?? ""): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DA_SCOPES,
    state,
  });
  return `${OAUTH_AUTHORIZE}?${params.toString()}`;
}

/** The donations page URL. Page 1 is the most recent. */
export function daDonationsUrl(page = 1): string {
  return `${DONATIONS}?page=${Math.max(1, Math.floor(page))}`;
}

/**
 * Parse DonationAlerts' `YYYY-MM-DD HH.MM.SS` timestamp.
 *
 * The dots are not a typo in the vendor doc — they really are dots, so the string is NOT
 * ISO-parseable and `new Date(raw)` returns Invalid Date. Returns null when unusable rather than
 * silently substituting "now", because the caller uses the timestamp for the poll cursor: a wrong
 * "now" would make an old donation look fresh forever.
 *
 * @remarks unit-tested in `__tests__/donations-donationalerts.test.ts`.
 */
export function parseDaTimestamp(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2})[.:](\d{2})[.:](\d{2})/.exec(raw.trim());
  if (!m) {
    const direct = new Date(raw);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }
  const [, y, mo, d, h, mi, s] = m;
  // The vendor sends no zone. Treating it as UTC is the safe reading: the value is only ever used
  // as an ordering cursor and for display, and guessing a local zone would shift every row.
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(ms) ? null : new Date(ms);
}

/**
 * Translate one DonationAlerts item into the normalized event, or null when it is unusable.
 *
 * @param item - One entry of the `data` array.
 * @returns The normalized donation, or null when the row cannot be trusted or deduped.
 *
 * @remarks
 * `trust` is NOT set here. The adapter has no way to know whether the credential that produced this
 * payload was ours — the route/cron that owns the token stamps it, exactly as with Ko-fi. A test
 * pins that this function never returns "verified".
 */
export function parseDaDonation(item: DonationAlertsItem): NormalizedDonation | null {
  if (!item || typeof item !== "object") return null;

  const currency = typeof item.currency === "string" ? item.currency.trim().toUpperCase() : "";
  if (!currency) return null; // no currency = no way to value it, and fx.ts must not guess

  const amountMinor = minorFromMajor(item.amount, currency);
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return null;
  if (amountMinor > MAX_AMOUNT_MINOR) return null; // guard the int4 column

  const donatedAt = parseDaTimestamp(item.created_at);

  // An "audio" message is a TTS payload, not text the viewer typed — but it still carries the
  // GE-code when the supporter typed one, so it is kept. Nothing else is derived from the type.
  const message = clampText(item.message, 2000);
  const donorName = clampText(item.username, 200) ?? "Anon";

  // A row we cannot place in time is DROPPED, not stamped with "now". Substituting the current
  // instant would make an arbitrarily old row look like it arrived this second — and since the
  // freshness cutoff and the stored cursor are both timestamps, one such row would replay history as
  // live, auto-credited income. The vendor always sends `created_at`, so this only fires if the
  // format changes (it is a Russian product; a dd.mm.yyyy or epoch variant is entirely plausible),
  // and then failing closed is the only safe reading.
  if (!donatedAt) return null;

  const ownId = item.id != null && item.id !== "" ? clampText(String(item.id), 180) : null;
  const at = donatedAt;
  return {
    provider: "donationalerts",
    providerEventId: ownId ?? syntheticExternalId("donationalerts", { donorName, amountMinor, currency, donatedAt: at }),
    donorName,
    message,
    amountMinor,
    currency,
    donatedAt: at,
    // Stamped by the caller that owns the credential — never here.
    trust: "unverified",
    raw: item,
  };
}

/** Translate a whole donations page (`{data:[…]}` or a bare array), dropping unusable rows. */
export function parseDaFeed(payload: unknown): NormalizedDonation[] {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? (payload as { data: unknown[] }).data
      : [];
  const out: NormalizedDonation[] = [];
  for (const item of items.slice(0, 200)) {
    const d = parseDaDonation(item as DonationAlertsItem);
    if (d) out.push(d);
  }
  return out;
}

/**
 * Exchange an authorization code (or refresh token) for an access token.
 *
 * @param grant - `{ code, redirectUri }` for the initial exchange, `{ refreshToken }` to renew.
 * @throws when the vendor answers non-2xx or a non-JSON body (`jsonOrThrow` names which).
 */
export async function daExchangeToken(
  grant: { code: string; redirectUri: string } | { refreshToken: string },
): Promise<DaTokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.DONATIONALERTS_CLIENT_ID ?? "",
    client_secret: process.env.DONATIONALERTS_CLIENT_SECRET ?? "",
    ...("code" in grant
      ? { grant_type: "authorization_code", code: grant.code, redirect_uri: grant.redirectUri }
      : { grant_type: "refresh_token", refresh_token: grant.refreshToken, scope: DA_SCOPES }),
  });

  const res = await httpFetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`donationalerts_token_http_${res.status}`);
  const json = await jsonOrThrow<DaTokenResponse>(res, "donationalerts token");
  if (!json?.access_token) throw new Error("donationalerts_token_missing_access_token");
  return json;
}

/** Fetch one page of the streamer's donations with their access token. */
export async function daFetchDonations(accessToken: string, page = 1): Promise<unknown> {
  const res = await httpFetch(daDonationsUrl(page), {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  if (res.status === 401) throw new Error("donationalerts_unauthorized"); // caller refreshes and retries
  if (!res.ok) throw new Error(`donationalerts_http_${res.status}`);
  return jsonOrThrow<unknown>(res, "donationalerts donations");
}
