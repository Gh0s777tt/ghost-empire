// src/lib/streamlabs.ts
// Streamlabs API integration — OAuth (+ token refresh) + donation polling + auto-matching.
//
// This is a real-money-in rail: every poll that fails is donated PLN that never becomes GT.
// The access token expires, so the poller refreshes it itself (see "OAuth token refresh"
// below) — before #801 the stored `refreshToken`/`tokenExpiresAt` were written by the OAuth
// callback and never read, so the first expiry silently killed donation ingest for ~2 months
// until an admin re-ran the connect flow by hand.
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { dispatchAlertSafe } from "@/lib/alerts";
import { incrementGoals } from "@/lib/stream-goals";
import { extendSubathon } from "@/lib/subathon";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { httpFetch, jsonOrThrow, parseJsonBody } from "@/lib/http";
import { awardSeasonXp } from "@/lib/seasons";
import { plnFromCurrency } from "@/lib/economy";
import { gtFromPln } from "@/lib/donation-rate";
import { sendDonationReceipt } from "@/lib/email-receipts";
import { extractDonationCode } from "@/lib/donation-code";
import { getStreamlabsConnection } from "@/lib/platform-tokens";

const STREAMLABS_OAUTH_AUTHORIZE = "https://streamlabs.com/api/v2.0/authorize";
const STREAMLABS_OAUTH_TOKEN = "https://streamlabs.com/api/v2.0/token";
const STREAMLABS_DONATIONS = "https://streamlabs.com/api/v2.0/donations";
const STREAMLABS_USER = "https://streamlabs.com/api/v2.0/user";

// Fallback redirect_uri z env — używany tylko, gdy caller nie poda per-host origin.
// Per-host (audyt 2026-08): callery z requestem PRZEKAZUJĄ redirectUri z hosta STREAMERA,
// żeby sub-tenant mógł podłączyć WŁASNE Streamlabs (redirect_uri musi byte-matchować w
// authorize i w exchange). Wartość dla danego portalu musi być zarejestrowana w appce Streamlabs.
const REDIRECT_URI = (process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app")
  + "/api/auth/streamlabs/callback";

const log = createLogger("streamlabs");

/** OAuth scopes requested at connect time — read-only donations + the alert socket token. */
export const SCOPES = "donations.read socket.token";

/**
 * Streamlabs consent URL to send the connecting admin to.
 *
 * @param state - Signed, nonce-bound state from `lib/oauth-state` (CSRF + tenant binding).
 * @param redirectUri - Per-host callback (audyt 2026-08) — sub-tenant podłącza WŁASNE Streamlabs,
 * więc redirect_uri musi byte-matchować w authorize i w exchange. Domyślnie env-fallback REDIRECT_URI.
 */
export function getAuthorizeUrl(state: string, redirectUri: string = REDIRECT_URI): string {
  const params = new URLSearchParams({
    client_id: process.env.STREAMLABS_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `${STREAMLABS_OAUTH_AUTHORIZE}?${params.toString()}`;
}

/** Streamlabs `/token` response — shared by the `authorization_code` and `refresh_token` grants. */
export type TokenResponse = {
  access_token: string;
  /** Rotated on every refresh; absent means "keep the one you have" (see refreshConnectionToken). */
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

/**
 * Exchange an OAuth `code` for the initial token set (connect flow).
 *
 * @param code - The authorization code returned to the callback.
 * @param redirectUri - Per-host callback (audyt 2026-08); MUST byte-match the value used in
 * {@link getAuthorizeUrl}. Defaults to the env fallback REDIRECT_URI.
 * @throws Error when Streamlabs rejects the exchange — the callback turns this into
 * `?streamlabs_error=token_exchange`.
 */
export async function exchangeCode(code: string, redirectUri: string = REDIRECT_URI): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.STREAMLABS_CLIENT_ID ?? "",
    client_secret: process.env.STREAMLABS_CLIENT_SECRET ?? "",
    // Musi byte-matchować redirect_uri użyty w authorize (patrz getAuthorizeUrl).
    redirect_uri: redirectUri,
    code,
  });
  const res = await httpFetch(STREAMLABS_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Streamlabs token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  // Even a 2xx can carry an HTML page (interstitial / login redirect that fetch followed) —
  // parseJsonBody says which upstream and what it actually sent instead of `Unexpected token '<'`.
  return parseJsonBody<TokenResponse>({
    label: "Streamlabs token exchange",
    status: res.status,
    contentType: res.headers.get("content-type"),
    body: text,
  });
}

// =====================================================
// OAuth token refresh — keeps the donation rail alive without an admin re-connect (#801)
// =====================================================

/**
 * How long *before* `tokenExpiresAt` a refresh is triggered. The cron polls every few minutes,
 * so 5 min comfortably covers a slow refresh plus the poll itself — a token must never expire
 * mid-flight and drop a donation batch on the floor.
 */
export const TOKEN_REFRESH_SKEW_MS = 5 * 60_000;

/**
 * Assumed access-token lifetime when Streamlabs omits `expires_in`. Storing `null` instead would
 * make {@link needsTokenRefresh} fire on *every* poll (unknown expiry ⇒ refresh), burning a
 * refresh-token rotation per cron tick.
 */
const DEFAULT_TOKEN_TTL_S = 3600;

/** Failure codes that distinguish "retry later" from "a human must act". */
export type StreamlabsAuthCode =
  /** The grant is dead — an admin has to re-run the OAuth connect flow in /admin. */
  | "reauth_required"
  /** Streamlabs refused the refresh transiently (5xx / rate limit) — the next cron tick retries. */
  | "refresh_failed"
  /** Streamlabs served its login page for a token that *looked* unexpired — force a refresh. */
  | "session_invalid"
  /** Ciphertext won't decrypt (ENCRYPTION_KEY rotated) — re-connect is the only fix. */
  | "token_unreadable";

/**
 * Auth-shaped failure of the Streamlabs rail, carrying a machine-readable {@link StreamlabsAuthCode}.
 *
 * @remarks The code is what makes the outage *alertable*: `pollAndProcessDonations` surfaces it as
 * `errorCode` so the cron can tag Sentry, and an operator can tell "Streamlabs is having a bad
 * afternoon" apart from "this portal's donations have stopped until someone clicks Connect".
 */
export class StreamlabsAuthError extends Error {
  readonly code: StreamlabsAuthCode;
  constructor(code: StreamlabsAuthCode, message: string) {
    super(message);
    this.name = "StreamlabsAuthError";
    this.code = code;
  }
}

/**
 * Should the stored access token be refreshed before we poll with it?
 *
 * @param tokenExpiresAt - Stored expiry; `null`/`undefined` means "unknown".
 * @param now - Injectable clock (ms) for tests.
 * @param skewMs - Refresh this far ahead of expiry. Defaults to {@link TOKEN_REFRESH_SKEW_MS}.
 * @returns `true` when the token is at/past expiry (minus skew), or its expiry is unknown.
 *
 * @remarks An **unknown** expiry counts as "refresh": rows written before this flow existed — or
 * by a Streamlabs response without `expires_in` — carry no expiry at all, and the #801 incident
 * was exactly such a row polling with a long-dead token. One refresh heals it into a row with a
 * known expiry, so this returns `false` on the next poll rather than looping.
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
 * @remarks Never returns `null` — a missing/garbage `expires_in` falls back to the module's
 * default TTL (1 h) so the stored row always has a usable expiry (see {@link needsTokenRefresh}
 * for why "unknown" is expensive).
 */
export function tokenExpiryFrom(expiresIn: number | null | undefined, now: number = Date.now()): Date {
  const secs = typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0
    ? expiresIn
    : DEFAULT_TOKEN_TTL_S;
  return new Date(now + secs * 1000);
}

/**
 * Is a refresh rejection permanent (the refresh token itself is gone) or worth retrying?
 *
 * @remarks Per OAuth 2.0 §5.2 a `400` carrying `invalid_grant` means the grant is dead for good,
 * and `invalid_client` means our own credentials are wrong — both need a human. A bare `400`
 * without those markers, and every 5xx, is treated as transient so a Streamlabs blip never nags
 * the streamer to re-connect a perfectly good token.
 */
export function classifyRefreshFailure(status: number, body: string): "reauth_required" | "transient" {
  if (status === 401 || status === 403) return "reauth_required";
  if (status === 400) {
    return /invalid_grant|invalid_client|invalid_request|unsupported_grant_type/i.test(body)
      ? "reauth_required"
      : "transient";
  }
  return "transient";
}

/**
 * Does a response body look like a web page rather than JSON?
 *
 * @remarks Streamlabs answers an expired/revoked `access_token` by serving its **HTML login page
 * with a 2xx** (observed in prod 2026-07-24) instead of a `401` + JSON error. On a 2xx from a JSON
 * API, a body starting with `<` can only be that — so we treat it as an auth failure and force a
 * refresh, instead of dying forever on an opaque `SyntaxError` from `JSON.parse`.
 */
export function isHtmlResponse(body: string): boolean {
  return body.trimStart().startsWith("<");
}

/**
 * POST `grant_type=refresh_token` to Streamlabs and return the fresh token set.
 *
 * @throws {StreamlabsAuthError} `reauth_required` when the grant is dead, `refresh_failed` for a
 * transient upstream failure or an unusable response body.
 */
async function requestRefreshedToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.STREAMLABS_CLIENT_ID ?? "",
    client_secret: process.env.STREAMLABS_CLIENT_SECRET ?? "",
    // Streamlabs' /token endpoint wants redirect_uri on the refresh grant too (it mirrors the
    // authorization_code shape) and matches it byte-for-byte against the connect-time value —
    // hence the shared REDIRECT_URI constant rather than a second literal.
    redirect_uri: REDIRECT_URI,
    refresh_token: refreshToken,
  });
  const res = await httpFetch(STREAMLABS_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    const kind = classifyRefreshFailure(res.status, text);
    throw new StreamlabsAuthError(
      kind === "reauth_required" ? "reauth_required" : "refresh_failed",
      `Streamlabs token refresh failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }
  let parsed: TokenResponse;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StreamlabsAuthError(
      "refresh_failed",
      `Streamlabs token refresh returned a non-JSON body: ${text.slice(0, 200)}`,
    );
  }
  // A 2xx without an access_token is useless — fail loudly rather than persisting `undefined`
  // over a working credential.
  if (!parsed?.access_token) {
    throw new StreamlabsAuthError("refresh_failed", "Streamlabs token refresh returned no access_token");
  }
  return parsed;
}

/** The resolved `StreamlabsConnection` row the poller works on (one per tenant). */
type StreamlabsConnectionRow = NonNullable<Awaited<ReturnType<typeof getStreamlabsConnection>>>;

/**
 * Refresh **this tenant's** connection and persist the rotated credentials, encrypted.
 *
 * @param conn - The tenant's row (`conn.id` pins the write to that portal — the poller never
 * touches another tenant's credentials).
 * @returns The fresh access token, usable immediately for this poll.
 * @throws {StreamlabsAuthError} `reauth_required` when there's no usable stored refresh token, or
 * whatever {@link requestRefreshedToken} raises.
 */
async function refreshConnectionToken(conn: StreamlabsConnectionRow): Promise<string> {
  const refreshToken = decryptSecret(conn.refreshToken);
  if (!refreshToken) {
    throw new StreamlabsAuthError(
      "reauth_required",
      "Brak (lub nieodczytywalny) refresh_token — połącz Streamlabs ponownie w /admin",
    );
  }

  const fresh = await requestRefreshedToken(refreshToken);

  // Streamlabs ROTATES the refresh token on use, so two concurrent refreshes (a cron tick racing
  // an admin "sync now") could have the slower one write its now-consumed token over the newer,
  // valid one — killing the rail in exactly the way this fix exists to prevent. Compare-and-swap
  // on the stored ciphertext: 0 rows ⇒ someone else already rotated, so keep THEIR write and just
  // use the access token we obtained for this poll (both access tokens are valid).
  const written = await prisma.streamlabsConnection.updateMany({
    where: { id: conn.id, refreshToken: conn.refreshToken },
    data: {
      accessToken: encryptSecret(fresh.access_token),
      // Keep the previous refresh token when the response doesn't carry a new one — nulling it
      // would make the *next* expiry unrecoverable without a manual re-connect.
      ...(fresh.refresh_token ? { refreshToken: encryptSecret(fresh.refresh_token) } : {}),
      tokenExpiresAt: tokenExpiryFrom(fresh.expires_in),
      ...(fresh.scope ? { scope: fresh.scope } : {}),
    },
  });
  if (written.count === 0) {
    log.warn("token refresh raced — a concurrent poll already rotated this connection", {
      tenantId: conn.tenantId,
    });
  } else {
    log.info("access token refreshed", { tenantId: conn.tenantId });
  }
  return fresh.access_token;
}

/**
 * The access token to poll with — refreshed first when the stored one is at/near expiry.
 *
 * @returns `refreshed` tells the caller whether a *reactive* refresh is still worth attempting
 * (see the retry in {@link pollAndProcessDonations}), so we can never loop refreshes.
 * @throws {StreamlabsAuthError} when no usable token can be produced.
 */
async function resolveAccessToken(
  conn: StreamlabsConnectionRow,
): Promise<{ token: string; refreshed: boolean }> {
  if (needsTokenRefresh(conn.tokenExpiresAt)) {
    if (conn.refreshToken) {
      return { token: await refreshConnectionToken(conn), refreshed: true };
    }
    // No refresh token stored at all (a connection made before Streamlabs returned one). The
    // stored access token may still be accepted, so TRY it instead of failing the poll outright —
    // but log it, because this row cannot self-heal and needs a re-connect eventually.
    log.warn("token at/near expiry but no refresh token stored — polling with the stored token", {
      tenantId: conn.tenantId,
      tokenExpiresAt: conn.tokenExpiresAt?.toISOString() ?? null,
    });
  }
  const stored = decryptSecret(conn.accessToken);
  if (!stored) {
    throw new StreamlabsAuthError(
      "token_unreadable",
      "Nieodczytywalny access_token (zmieniony ENCRYPTION_KEY?) — połącz Streamlabs ponownie w /admin",
    );
  }
  return { token: stored, refreshed: false };
}

export type StreamlabsUser = {
  streamlabs?: { id: number; display_name: string };
  twitch?: { display_name: string };
};

/** Connected account's display identity — cosmetic only (shown in /admin), never used for money. */
export async function fetchUserInfo(accessToken: string): Promise<StreamlabsUser> {
  const res = await httpFetch(`${STREAMLABS_USER}?access_token=${accessToken}`);
  if (!res.ok) {
    throw new Error(`Streamlabs user info fetch failed (${res.status})`);
  }
  return jsonOrThrow<StreamlabsUser>(res, "Streamlabs user info");
}

/** One donation as Streamlabs reports it. `amount` arrives as a string on some accounts. */
export type StreamlabsDonation = {
  donation_id: number;
  created_at: number;       // unix timestamp
  currency: string;
  amount: string | number;  // sometimes string
  name: string;
  message: string | null;
  email?: string;
  _id?: string;
};

/**
 * Fetch verified donations newer than `afterDonationId`.
 *
 * @param opts.accessToken - Decrypted, non-expired token (get it via the poller's refresh path).
 * @param opts.afterDonationId - `lastSeenDonationId` cursor; omit to read the newest page.
 * @returns Newest-first donations, or `[]` when the payload carries none.
 * @throws {StreamlabsAuthError} `session_invalid` when the token is rejected — Streamlabs signals
 * that with an HTML login page on a **2xx**, not a 401.
 * @throws Error on a non-2xx or an unparseable body.
 */
export async function fetchDonations(opts: {
  accessToken: string;
  afterDonationId?: string;
  limit?: number;
}): Promise<StreamlabsDonation[]> {
  const params = new URLSearchParams({
    access_token: opts.accessToken,
    limit: String(opts.limit ?? 50),
    verified: "1", // only verified payments
  });
  if (opts.afterDonationId) {
    params.set("after", opts.afterDonationId);
  }
  const res = await httpFetch(`${STREAMLABS_DONATIONS}?${params.toString()}`);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Streamlabs donations fetch failed (${res.status}): ${text.slice(0, 200)}`);
  }
  // A 2xx whose body is a web page means our access_token is no longer accepted — Streamlabs
  // serves its login page rather than a 401 (see isHtmlResponse). Raise a TYPED auth error so the
  // poller refreshes and retries (see pollAndProcessDonations), instead of returning "0 donations"
  // or the bare `Unexpected token '<', "<!DOCTYPE "…` that used to hit the cron's Sentry alert on
  // the money-in rail (#GHOST-EMPIRE-WEB-5).
  if (isHtmlResponse(text)) {
    throw new StreamlabsAuthError(
      "session_invalid",
      "Streamlabs zwrócił stronę logowania z kodem 2xx — access_token odrzucony",
    );
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Streamlabs donations fetch returned a non-JSON body: ${text.slice(0, 200)}`);
  }
  return Array.isArray(data?.data) ? data.data : [];
}

/**
 * Try to match a donation to a Ghost Empire user — VERIFIED only (#audit3).
 * The only auto-credit path is a personal donation code (shown on the user's profile)
 * present in the donation message. Donor-name / `@mention` auto-matching was REMOVED — it
 * let a payer aim a donation's GT at any account they named. Codeless donations return
 * null and land in the manual admin reconciliation queue (/api/admin/donations).
 */
export async function matchDonationToUser(
  message: string | null,
  tenantId: string | null,
): Promise<{ userId: string; matchType: string } | null> {
  const code = extractDonationCode(message);
  if (!code) return null;
  // Scope to the donation's portal (+ legacy null-tenant) for cross-tenant safety; the
  // code is globally unique, so this resolves at most one user.
  const tw = tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {};
  const user = await prisma.user.findFirst({
    where: { donationCode: code, ...tw },
    select: { id: true },
  });
  return user ? { userId: user.id, matchType: "code" } : null;
}

/**
 * Poll Streamlabs for new donations, store them, auto-match where possible.
 *
 * @param tenantId - Portal to poll; `undefined` resolves from the request host, `null` is the
 * legacy founder row (see `platform-tokens.ts`).
 * @returns `ok:false` (never a throw) on any auth/fetch failure, plus `errorCode` when the failure
 * is auth-shaped — the cron turns that into a Sentry tag so a stalled money rail is alertable.
 */
export async function pollAndProcessDonations(tenantId?: string | null): Promise<{
  ok: boolean;
  fetched: number;
  matched: number;
  unmatched: number;
  error?: string;
  errorCode?: StreamlabsAuthCode;
}> {
  // Per-portal: resolve THIS tenant's Streamlabs connection (the cron loops every portal).
  // Downstream writes scope to conn.tenantId, so a sub-tenant's donations stay on its board.
  const conn = await getStreamlabsConnection(tenantId);
  if (!conn) return { ok: false, fetched: 0, matched: 0, unmatched: 0, error: "not_connected" };

  // Token decrypt failure is handled inside resolveAccessToken (throws a typed `token_unreadable`
  // StreamlabsAuthError → surfaced below as errorCode), so no separate guard is needed here — the
  // refresh path SUPERSEDES the old fail-fast `token_decrypt_failed` return.
  const pull = (accessToken: string) =>
    fetchDonations({
      accessToken,
      afterDonationId: conn.lastSeenDonationId ?? undefined,
      limit: 50,
    });

  let donations: StreamlabsDonation[];
  try {
    // Refresh first when the stored token is at/near expiry — an expired token is the whole
    // reason this rail once went quiet for two months (#801).
    const tok = await resolveAccessToken(conn);
    try {
      donations = await pull(tok.token);
    } catch (e) {
      // The stored expiry can LIE: a revoked or early-rotated token still looks fresh, and
      // Streamlabs answers it with its login page on a 2xx. One forced refresh, one retry — and
      // only when we didn't already refresh above, so this can never become a refresh loop.
      if (tok.refreshed || !(e instanceof StreamlabsAuthError && e.code === "session_invalid")) throw e;
      log.warn("access token rejected despite an unexpired stored expiry — forcing a refresh", {
        tenantId: conn.tenantId,
      });
      donations = await pull(await refreshConnectionToken(conn));
    }
  } catch (e) {
    // Return rather than throw: the cron's per-portal loop must keep polling the other portals,
    // and it already escalates a returned ok:false to Sentry.
    const error = e instanceof Error ? e.message : "fetch_failed";
    log.error("donation poll failed", e, { tenantId: conn.tenantId });
    return {
      ok: false,
      fetched: 0,
      matched: 0,
      unmatched: 0,
      error,
      ...(e instanceof StreamlabsAuthError ? { errorCode: e.code } : {}),
    };
  }

  let matched = 0;
  // Receipts are collected here and flushed once AFTER the loop (see the push site): keeping email
  // out of the per-donation chain means a slow provider can never cost a donation its side-effects.
  const receipts: Array<Parameters<typeof sendDonationReceipt>[0]> = [];
  let unmatched = 0;

  // Idempotency: ONE batched read of which donation_ids are already stored, instead of a
  // findUnique per donation against the small (max:3) pool (#748). externalId is @unique.
  const processed = new Set(
    (
      await prisma.donation.findMany({
        where: { externalId: { in: donations.map((d) => String(d.donation_id)) } },
        select: { externalId: true },
      })
    ).map((row) => row.externalId),
  );

  for (const d of donations) {
    const externalId = String(d.donation_id);
    // Skip if already processed
    if (processed.has(externalId)) continue;

    const amountFloat = Number(d.amount);
    if (!Number.isFinite(amountFloat) || amountFloat <= 0) continue;
    const amountGrosze = Math.round(amountFloat * 100);

    const match = await matchDonationToUser(d.message, conn.tenantId);

    if (match) {
      // Currency-aware (convert to PLN first) + capped, so non-PLN or malformed amounts
      // don't mint GT 1:1 as if PLN. #audit3 MED-2
      const tokensGranted = gtFromPln(plnFromCurrency(amountFloat, d.currency)); // shared rate + cap (lib/donation-rate)
      await prisma.$transaction([
        prisma.donation.create({
          data: {
            tenantId: conn.tenantId, // Batch B: scope to the connection's portal
            externalId,
            source: "streamlabs",
            donorName: d.name.slice(0, 200),
            message: d.message?.slice(0, 2000) ?? null,
            amountGrosze,
            currency: d.currency,
            donatedAt: new Date(d.created_at * 1000),
            userId: match.userId,
            matchedAt: new Date(),
            matchType: match.matchType,
            tokensGranted,
          },
        }),
        prisma.user.update({
          where: { id: match.userId },
          data: {
            isDonator: true,
            totalDonated: { increment: amountGrosze },
            tokens: { increment: tokensGranted },
            totalEarned: { increment: tokensGranted },
          },
        }),
        prisma.transaction.create({
          data: {
            userId: match.userId,
            type: "earn",
            amount: tokensGranted,
            reason: `donation:streamlabs:${d.donation_id}`,
            status: "completed",
            note: d.message?.slice(0, 500) ?? null,
          },
        }),
        prisma.notification.create({
          data: {
            userId: match.userId,
            type: "system",
            title: `Dzięki za donację ${amountFloat.toFixed(2)} ${d.currency}!`,
            message: `Otrzymałeś ${tokensGranted.toLocaleString("pl-PL")} %gt%. Jesteś teraz Donatorem.`,
            icon: "❤️",
            link: "/profile",
          },
        }),
      ]);

      // Fetch matched user for actor info
      const matchedUser = await prisma.user.findUnique({
        where: { id: match.userId },
        select: { username: true, displayName: true, image: true },
      });
      await dispatchAlertSafe({
        type: "donation",
        title: "❤️ Donacja!",
        message: d.message
          ? `wpłacił z wiadomością: ${d.message.slice(0, 80)}`
          : "wsparł streamera",
        icon: "❤️",
        actorName: matchedUser?.displayName || matchedUser?.username || d.name,
        actorImage: matchedUser?.image ?? undefined,
        amount: Math.round(amountFloat * 100) / 100,
        amountLabel: d.currency,
      }, conn.tenantId);

      // Queue the receipt — do NOT await here. This sits mid-chain (achievements, season XP, goal
      // and subathon bumps still follow), and the Donation row is already committed, so a function
      // timeout while emailing would lose those side-effects PERMANENTLY (the next poll skips the
      // donation as already processed). Collected and flushed once after the loop instead.
      receipts.push({
        userId: match.userId,
        tenantId: conn.tenantId,
        amount: amountFloat, // as charged, in d.currency — never the synthetic PLN conversion
        currency: d.currency,
        tokensGranted,
      });

      // Achievements — donation count + cumulative PLN
      await checkAndGrantAchievements({ userId: match.userId, triggerType: "donations_count" });
      await checkAndGrantAchievements({ userId: match.userId, triggerType: "donations_amount_pln" });
      // Season XP proportional to PLN amount
      await awardSeasonXp(match.userId, "donation_per_pln", amountFloat);

      matched++;
    } else {
      // Unmatched — store for admin reconciliation
      await prisma.donation.create({
        data: {
          tenantId: conn.tenantId, // Batch B: scope to the connection's portal
          externalId: String(d.donation_id),
          source: "streamlabs",
          donorName: d.name.slice(0, 200),
          message: d.message?.slice(0, 2000) ?? null,
          amountGrosze,
          currency: d.currency,
          donatedAt: new Date(d.created_at * 1000),
        },
      });

      // Still alert — streamer wants to see EVERY donation on overlay even if donor isn't linked
      await dispatchAlertSafe({
        type: "donation",
        title: "❤️ Donacja!",
        message: d.message
          ? `wpłacił z wiadomością: ${d.message.slice(0, 80)}`
          : "wsparł streamera",
        icon: "❤️",
        actorName: d.name,
        amount: Math.round(amountFloat * 100) / 100,
        amountLabel: d.currency,
      }, conn.tenantId);

      unmatched++;
    }

    // Both branches above persisted the donation row — remember it so a duplicate id
    // within the same batch can't double-insert (parity with the old per-row check).
    processed.add(externalId);

    // Bump donations_pln goal — applies to BOTH matched and unmatched donations.
    // Currency conversion shared with YouTube super chats (see economy.ts).
    const plnAmount = plnFromCurrency(amountFloat, d.currency);
    await incrementGoals("donations_pln", Math.floor(plnAmount), conn.tenantId);
    void extendSubathon({ pln: Math.floor(plnAmount) }, conn.tenantId).catch(() => {});
  }

  // Flush the queued receipts LAST — after every donation's money + side-effects are durable, and
  // in parallel (bounded by sendEmail's own timeout) rather than serially per donation. allSettled
  // + the sender's internal try/catch mean a failing provider can never fail the poll.
  if (receipts.length) await Promise.allSettled(receipts.map((r) => sendDonationReceipt(r)));

  // Update lastSeenDonationId to most recent (donations[0] is newest by default)
  const newest = donations[0]?.donation_id;
  await prisma.streamlabsConnection.update({
    where: { id: conn.id },
    data: {
      lastPolledAt: new Date(),
      ...(newest ? { lastSeenDonationId: String(newest) } : {}),
    },
  });

  return { ok: true, fetched: donations.length, matched, unmatched };
}
