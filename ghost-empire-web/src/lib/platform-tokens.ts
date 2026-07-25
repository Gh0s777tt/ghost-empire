// src/lib/platform-tokens.ts
// Tenant-aware access to the 4 per-streamer platform credentials
// (TwitchStreamerToken / KickStreamerToken / YouTubeStreamerToken /
// StreamlabsConnection). Phase-4 SaaS pattern, same as the config singletons
// (#235): rows are keyed by `tenantId @unique`; when no tenant is resolvable
// (pre-backfill, or single-tenant deployments) we fall back to the legacy
// `id: "default"` row so nothing breaks during rollout.
//
// `tenantId` parameter semantics (all getters):
//   undefined → resolve via currentTenantId() (Host-based on /api — #234)
//   string    → use that tenant (webhook handlers that mapped broadcaster→tenant)
//   null      → legacy row directly
//
// Two flavours of accessor live here:
//   • `get*StreamerToken` — the raw row (broadcaster id/login, connection status). Safe for
//     display; the stored `accessToken` may well be expired.
//   • `getValid*AccessToken` — a decrypted access token that is actually usable *now*, refreshing
//     and persisting via the stored `refreshToken` first when needed. Anything making a real API
//     call on the streamer's behalf must use these, never `decryptSecret(row.accessToken)`.
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { OAuthTokenError, resolveStreamerAccessToken } from "@/lib/oauth-refresh";

type Tid = string | null | undefined;

async function resolveTid(tenantId: Tid): Promise<string | null> {
  return tenantId === undefined ? await currentTenantId() : tenantId;
}

export async function getTwitchStreamerToken(tenantId?: Tid) {
  const tid = await resolveTid(tenantId);
  if (tid) {
    const row = await prisma.twitchStreamerToken.findUnique({ where: { tenantId: tid } });
    if (row) return row;
  }
  return prisma.twitchStreamerToken.findUnique({ where: { id: "default" } });
}

export async function getKickStreamerToken(tenantId?: Tid) {
  const tid = await resolveTid(tenantId);
  if (tid) {
    const row = await prisma.kickStreamerToken.findUnique({ where: { tenantId: tid } });
    if (row) return row;
  }
  return prisma.kickStreamerToken.findUnique({ where: { id: "default" } });
}

export async function getYouTubeStreamerToken(tenantId?: Tid) {
  const tid = await resolveTid(tenantId);
  if (tid) {
    const row = await prisma.youTubeStreamerToken.findUnique({ where: { tenantId: tid } });
    if (row) return row;
  }
  return prisma.youTubeStreamerToken.findUnique({ where: { id: "default" } });
}

export async function getStreamlabsConnection(tenantId?: Tid) {
  const tid = await resolveTid(tenantId);
  if (tid) {
    const row = await prisma.streamlabsConnection.findUnique({ where: { tenantId: tid } });
    if (row) return row;
  }
  return prisma.streamlabsConnection.findUnique({ where: { id: "default" } });
}

// =====================================================
// Usable access tokens — refresh-on-read (#801 follow-up)
//
// The OAuth callbacks have always stored `refreshToken` + `tokenExpiresAt` for Twitch and Kick, and
// nothing ever read them: callers decrypted `accessToken` directly. Twitch user tokens live ~4 h
// and Kick's ~1 h, so in practice every call after the first session used a dead credential and the
// only cure was re-running the OAuth flow by hand. These two functions close that gap; the shared
// mechanics (staleness, expiry, failure classification, compare-and-swap write) live in
// `lib/oauth-refresh.ts`.
// =====================================================

const TWITCH_OAUTH_TOKEN = "https://id.twitch.tv/oauth2/token";
const KICK_OAUTH_TOKEN = "https://id.kick.com/oauth/token";

/**
 * This portal's Twitch **user** access token, guaranteed fresh.
 *
 * @param tenantId - Same semantics as {@link getTwitchStreamerToken}.
 * @returns A decrypted access token, refreshed and persisted first if the stored one was expiring.
 * @throws {OAuthTokenError} `reauth_required` (no connection, or the grant is dead — an admin must
 * re-connect at `/admin#twitch`), `refresh_failed` (transient — retry), or `token_unreadable`.
 *
 * @remarks Only needed for Helix calls made **as the streamer** (`createTwitchClip` and its
 * `clips:edit` scope). Reads of public channel data — clip lists, live status, chat badges — and
 * **EventSub webhook subscriptions** use an *app* access token (`getAppAccessToken` in `lib/twitch`)
 * and are unaffected by this token's expiry.
 */
export async function getValidTwitchAccessToken(tenantId?: Tid): Promise<string> {
  const row = await getTwitchStreamerToken(tenantId);
  if (!row) {
    throw new OAuthTokenError(
      "twitch",
      "reauth_required",
      "twitch: streamer nie jest autoryzowany — połącz konto w /admin#twitch",
    );
  }
  return resolveStreamerAccessToken({
    provider: "twitch",
    row,
    tokenUrl: TWITCH_OAUTH_TOKEN,
    clientId: process.env.TWITCH_CLIENT_ID ?? "",
    clientSecret: process.env.TWITCH_CLIENT_SECRET ?? "",
    reconnectHint: "/admin#twitch",
    // Compare-and-swap on the refresh token we read, so a concurrent refresh can't be clobbered
    // by this one's now-consumed value. Pinned to `row.id` → never another portal's row.
    persist: (data) =>
      prisma.twitchStreamerToken
        .updateMany({ where: { id: row.id, refreshToken: row.refreshToken }, data })
        .then((r) => r.count),
  });
}

/**
 * This portal's Kick **user** access token, guaranteed fresh.
 *
 * @param tenantId - Same semantics as {@link getKickStreamerToken}.
 * @returns A decrypted access token, refreshed and persisted first if the stored one was expiring.
 * @throws {OAuthTokenError} `reauth_required` (no connection, or the grant is dead — an admin must
 * re-connect at `/admin#kick`), `refresh_failed` (transient — retry), or `token_unreadable`.
 *
 * @remarks Kick requires the **streamer's** token to create or delete webhook subscriptions (an app
 * token can only list them), so `/api/admin/kick-events` genuinely cannot work without this.
 */
export async function getValidKickAccessToken(tenantId?: Tid): Promise<string> {
  const row = await getKickStreamerToken(tenantId);
  if (!row) {
    throw new OAuthTokenError(
      "kick",
      "reauth_required",
      "kick: streamer nie jest autoryzowany — połącz konto w /admin#kick",
    );
  }
  return resolveStreamerAccessToken({
    provider: "kick",
    row,
    tokenUrl: KICK_OAUTH_TOKEN,
    clientId: process.env.KICK_CLIENT_ID ?? "",
    clientSecret: process.env.KICK_CLIENT_SECRET ?? "",
    reconnectHint: "/admin#kick",
    persist: (data) =>
      prisma.kickStreamerToken
        .updateMany({ where: { id: row.id, refreshToken: row.refreshToken }, data })
        .then((r) => r.count),
  });
}

/**
 * Upsert key for a token write: per-tenant row when the tenant is known,
 * the legacy "default" row otherwise. `create` must spread `createKey`.
 */
export function tokenUpsertKeys(tid: string | null) {
  return tid
    ? { where: { tenantId: tid } as const, createKey: { tenantId: tid } as const }
    : { where: { id: "default" } as const, createKey: { id: "default" } as const };
}

/** Map a Twitch broadcaster_user_id (from a webhook event) to its tenant. */
export async function tenantIdForTwitchBroadcaster(broadcasterId: string): Promise<string | null> {
  const row = await prisma.twitchStreamerToken.findFirst({
    where: { broadcasterId },
    select: { tenantId: true },
  });
  return row?.tenantId ?? null;
}

/** Map a Kick broadcaster id (from a webhook event) to its tenant. */
export async function tenantIdForKickBroadcaster(broadcasterId: string): Promise<string | null> {
  const row = await prisma.kickStreamerToken.findFirst({
    where: { broadcasterId },
    select: { tenantId: true },
  });
  return row?.tenantId ?? null;
}
