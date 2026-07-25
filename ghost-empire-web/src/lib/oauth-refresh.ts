// src/lib/oauth-refresh.ts
// Shared OAuth 2.0 refresh-token plumbing for the per-streamer platform credentials that
// `platform-tokens.ts` resolves (Twitch + Kick today; YouTube and Streamlabs are the two older,
// hand-rolled copies this module exists to absorb).
//
// Why a shared module: every provider stores the same triple — an encrypted `accessToken`, an
// encrypted `refreshToken` and a `tokenExpiresAt` — and every one has to answer the same three
// questions before it can call the provider's API:
//   1. is the stored access token stale?              → needsTokenRefresh
//   2. how long is the replacement good for?          → tokenExpiryFrom
//   3. is a refusal permanent, or worth retrying?     → classifyRefreshFailure
// Those three are pure functions, so they live here and are unit-tested with no DB and no network.
// Everything provider-specific (token endpoint, client credentials, which Prisma model to write)
// stays with the caller, which hands us a `persist` callback.
//
// The invariant this protects: **a `refreshToken` that is written but never read is the same as no
// refresh token at all.** Twitch user access tokens live ~4 h and Kick's ~1 h, so the stored
// credential is dead long before the next admin action, and only a manual OAuth re-connect used to
// revive it. #801 fixed exactly this bug on the Streamlabs rail; this is the same fix, generalised.
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { httpFetch } from "@/lib/http";
import { createLogger } from "@/lib/logger";

const log = createLogger("oauth-refresh");

/**
 * How long *before* `tokenExpiresAt` a refresh is triggered.
 *
 * @remarks Generous on purpose: the token must not expire *between* our refresh check and the API
 * call it guards, and an admin action can sit several seconds behind a slow upstream. Refreshing
 * 5 minutes early costs one extra token rotation; refreshing too late costs the whole request.
 */
export const TOKEN_REFRESH_SKEW_MS = 5 * 60_000;

/**
 * Assumed access-token lifetime when the provider omits `expires_in`.
 *
 * @remarks Storing "unknown" instead would make {@link needsTokenRefresh} fire on *every* call
 * (unknown expiry ⇒ refresh), burning a refresh-token rotation per request.
 */
const DEFAULT_TOKEN_TTL_S = 3600;

/** Failure codes that separate "retry later" from "a human has to re-connect the account". */
export type OAuthRefreshCode =
  /** The grant is dead — an admin has to re-run the OAuth connect flow in /admin. */
  | "reauth_required"
  /** The provider refused the refresh transiently (5xx / rate limit) — the next call retries. */
  | "refresh_failed"
  /** Stored ciphertext won't decrypt (ENCRYPTION_KEY rotated) — re-connect is the only fix. */
  | "token_unreadable";

/**
 * Auth-shaped failure of a streamer platform connection, carrying a machine-readable
 * {@link OAuthRefreshCode}.
 *
 * @remarks The code is what makes the failure *actionable*: an admin route can tell
 * "Kick is having a bad afternoon" (`refresh_failed`, retry) apart from "this portal's Kick
 * connection is dead until someone clicks Connect" (`reauth_required`, show the button).
 */
export class OAuthTokenError extends Error {
  readonly code: OAuthRefreshCode;
  /** Provider slug ("twitch" | "kick" | …) — used for logging and admin-facing copy. */
  readonly provider: string;
  constructor(provider: string, code: OAuthRefreshCode, message: string) {
    super(message);
    this.name = "OAuthTokenError";
    this.provider = provider;
    this.code = code;
  }
}

/** A provider's `/token` response, normalised across the shapes Twitch and Kick actually send. */
export type RefreshedTokens = {
  accessToken: string;
  /** `null` means "the provider did not rotate it — keep the stored one". */
  refreshToken: string | null;
  /** Seconds, or `null` when the provider omitted it (see {@link tokenExpiryFrom}). */
  expiresIn: number | null;
  /** Space-separated, already normalised by {@link normalizeScope}. */
  scope: string | null;
};

/**
 * Should the stored access token be refreshed before we use it?
 *
 * @param tokenExpiresAt - Stored expiry; `null`/`undefined` means "unknown".
 * @param now - Injectable clock (ms) for tests.
 * @param skewMs - Refresh this far ahead of expiry. Defaults to {@link TOKEN_REFRESH_SKEW_MS}.
 * @returns `true` when the token is at/past expiry (minus skew), or its expiry is unknown.
 *
 * @remarks An **unknown** expiry deliberately counts as "refresh". `TwitchStreamerToken` and
 * `KickStreamerToken` both declare `tokenExpiresAt DateTime?`, and the OAuth callbacks write
 * `null` whenever the provider omits `expires_in` — so a row with no expiry is a row we know
 * nothing about, and the safe reading of "nothing" is "assume dead". One refresh heals it into a
 * row with a known expiry, so the next call returns `false` instead of looping.
 */
export function needsTokenRefresh(
  tokenExpiresAt: Date | null | undefined,
  now: number = Date.now(),
  skewMs: number = TOKEN_REFRESH_SKEW_MS,
): boolean {
  if (!tokenExpiresAt) return true;
  return tokenExpiresAt.getTime() <= now + skewMs;
}

/**
 * Absolute expiry for a token response's `expires_in` (seconds).
 *
 * @remarks Never returns `null` — a missing or garbage `expires_in` falls back to the module's
 * default TTL (1 h) so the persisted row always carries a usable expiry. See
 * {@link needsTokenRefresh} for why an unknown expiry is expensive.
 */
export function tokenExpiryFrom(
  expiresIn: number | null | undefined,
  now: number = Date.now(),
  defaultTtlS: number = DEFAULT_TOKEN_TTL_S,
): Date {
  const secs =
    typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0
      ? expiresIn
      : defaultTtlS;
  return new Date(now + secs * 1000);
}

/**
 * Is a rejected refresh permanent (the grant itself is gone) or worth retrying?
 *
 * @returns `"reauth_required"` when only a human can fix it, `"transient"` otherwise.
 *
 * @remarks Per OAuth 2.0 §5.2 a `400` carrying `invalid_grant` / `invalid_client` is fatal. Twitch
 * does **not** use those codes — a revoked grant comes back as
 * `400 {"message":"Invalid refresh token"}` — so the pattern also matches that prose, otherwise a
 * genuinely dead Twitch connection would be misread as transient and never prompt a re-connect.
 * A bare `400` with none of those markers, and every 5xx, stays transient so a provider blip never
 * nags the streamer to re-connect a perfectly good token.
 */
export function classifyRefreshFailure(
  status: number,
  body: string,
): "reauth_required" | "transient" {
  if (status === 401 || status === 403) return "reauth_required";
  if (status === 400) {
    return /invalid[ _-]?(grant|client|request|token|refresh[ _-]?token)|unsupported_grant_type|refresh[ _-]?token[ _-]?(is[ _-]?)?(invalid|expired|revoked)/i.test(body)
      ? "reauth_required"
      : "transient";
  }
  return "transient";
}

/**
 * Normalise a provider's `scope` field to the space-separated string the DB column stores.
 *
 * @remarks Twitch returns `scope` as a JSON **array** while Kick returns a space-separated
 * **string**. Persisting the array's default stringification would write `"a,b,c"`, quietly
 * breaking every `scope.split(/\s+/).includes(…)` check downstream (that check is what gates
 * `createTwitchClip` on `clips:edit`) — so array-vs-string is normalised here, once.
 */
export function normalizeScope(scope: unknown): string | null {
  if (Array.isArray(scope)) return scope.filter((s) => typeof s === "string").join(" ");
  if (typeof scope === "string") return scope;
  return null;
}

/**
 * Parse a `/token` response body into {@link RefreshedTokens}.
 *
 * @param provider - Provider slug, for the error's `provider` field.
 * @param body - Raw response text (read as text, not JSON, so a non-JSON error page is reportable).
 * @throws {OAuthTokenError} `refresh_failed` when the body isn't JSON, or is a 2xx carrying no
 * `access_token` — persisting `undefined` over a working credential would turn a transient upstream
 * hiccup into a permanent outage.
 */
export function parseTokenPayload(provider: string, body: string): RefreshedTokens {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new OAuthTokenError(
      provider,
      "refresh_failed",
      `${provider}: odświeżenie tokenu zwróciło odpowiedź nie-JSON: ${body.slice(0, 200)}`,
    );
  }
  const accessToken = parsed?.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new OAuthTokenError(
      provider,
      "refresh_failed",
      `${provider}: odświeżenie tokenu nie zwróciło access_token`,
    );
  }
  const refreshToken = parsed.refresh_token;
  const expiresIn = parsed.expires_in;
  return {
    accessToken,
    refreshToken: typeof refreshToken === "string" && refreshToken ? refreshToken : null,
    expiresIn: typeof expiresIn === "number" ? expiresIn : null,
    scope: normalizeScope(parsed.scope),
  };
}

/**
 * POST `grant_type=refresh_token` to a provider's token endpoint.
 *
 * @remarks Twitch and Kick take byte-identical form bodies here, which is why one function covers
 * both. `extraParams` exists for providers that demand more (Streamlabs, for instance, wants
 * `redirect_uri` echoed on the refresh grant).
 * @throws {OAuthTokenError} `reauth_required` when the grant is dead, `refresh_failed` for a
 * transient upstream failure or an unusable body.
 */
export async function requestRefreshedToken(opts: {
  provider: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  extraParams?: Record<string, string>;
}): Promise<RefreshedTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    ...(opts.extraParams ?? {}),
  });
  const res = await httpFetch(opts.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    const kind = classifyRefreshFailure(res.status, text);
    throw new OAuthTokenError(
      opts.provider,
      kind === "reauth_required" ? "reauth_required" : "refresh_failed",
      `${opts.provider}: odświeżenie tokenu nie powiodło się (${res.status}): ${text.slice(0, 300)}`,
    );
  }
  return parseTokenPayload(opts.provider, text);
}

/** The stored-credential shape this module needs; both streamer-token models satisfy it. */
export type StreamerTokenRow = {
  id: string;
  tenantId: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
};

/** The already-encrypted column values a refresh writes back. */
export type TokenUpdate = {
  accessToken: string;
  /** Omitted when the provider didn't rotate it — see {@link resolveStreamerAccessToken}. */
  refreshToken?: string;
  tokenExpiresAt: Date;
  scope?: string;
};

/**
 * The access token to call a provider's API with — refreshed and persisted first when the stored
 * one is at or near expiry.
 *
 * @param opts.row - This tenant's credential row (`row.id` pins the write to that portal — we never
 * touch another tenant's credentials).
 * @param opts.persist - Writes `update` back and returns the number of rows changed. The caller
 * owns this because the Prisma model differs per provider; it **must** compare-and-swap on
 * `row.refreshToken` (see the remark below).
 * @param opts.reconnectHint - Where an admin goes to re-connect, e.g. `"/admin#kick"`; interpolated
 * into the `reauth_required` message that reaches the admin UI.
 * @returns A decrypted, usable access token.
 * @throws {OAuthTokenError} when no usable token can be produced.
 *
 * @remarks **Why the caller's `persist` must compare-and-swap:** both providers rotate the refresh
 * token on use, so two concurrent refreshes (two admin tabs, or an admin action racing a
 * background read) could let the slower one write its now-consumed refresh token over the newer,
 * valid one — killing the connection in exactly the way this code exists to prevent. `0 rows
 * changed` means someone else already rotated: keep **their** write and just use the access token
 * we obtained, since both access tokens are valid.
 */
export async function resolveStreamerAccessToken(opts: {
  provider: string;
  row: StreamerTokenRow;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  reconnectHint: string;
  persist: (update: TokenUpdate) => Promise<number>;
  extraParams?: Record<string, string>;
  skewMs?: number;
}): Promise<string> {
  const { provider, row, reconnectHint } = opts;

  if (needsTokenRefresh(row.tokenExpiresAt, Date.now(), opts.skewMs)) {
    if (row.refreshToken) return refreshAndPersist(opts);
    // No refresh token stored at all (a connection made before the provider returned one, or one
    // whose ciphertext was written as null). The stored access token may still be accepted, so TRY
    // it rather than failing outright — but warn, because this row cannot self-heal.
    log.warn("token at/near expiry but no refresh token stored — using the stored access token", {
      provider,
      tenantId: row.tenantId,
      tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    });
  }

  const stored = decryptSecret(row.accessToken);
  if (!stored) {
    throw new OAuthTokenError(
      provider,
      "token_unreadable",
      `${provider}: nieodczytywalny access_token (zmieniony ENCRYPTION_KEY?) — połącz konto ponownie w ${reconnectHint}`,
    );
  }
  return stored;
}

/** Refresh this row's credentials and persist them encrypted. See {@link resolveStreamerAccessToken}. */
async function refreshAndPersist(
  opts: Parameters<typeof resolveStreamerAccessToken>[0],
): Promise<string> {
  const { provider, row, reconnectHint } = opts;

  const refreshToken = decryptSecret(row.refreshToken);
  if (!refreshToken) {
    throw new OAuthTokenError(
      provider,
      "reauth_required",
      `${provider}: nieodczytywalny refresh_token — połącz konto ponownie w ${reconnectHint}`,
    );
  }

  const fresh = await requestRefreshedToken({
    provider,
    tokenUrl: opts.tokenUrl,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    refreshToken,
    extraParams: opts.extraParams,
  });

  const written = await opts.persist({
    accessToken: encryptSecret(fresh.accessToken),
    // Keep the previous refresh token when the response doesn't carry a new one — nulling it would
    // make the *next* expiry unrecoverable without a manual re-connect.
    ...(fresh.refreshToken ? { refreshToken: encryptSecret(fresh.refreshToken) } : {}),
    tokenExpiresAt: tokenExpiryFrom(fresh.expiresIn),
    ...(fresh.scope ? { scope: fresh.scope } : {}),
  });

  if (written === 0) {
    log.warn("token refresh raced — a concurrent refresh already rotated this row", {
      provider,
      tenantId: row.tenantId,
    });
  } else {
    log.info("access token refreshed", { provider, tenantId: row.tenantId });
  }
  return fresh.accessToken;
}
