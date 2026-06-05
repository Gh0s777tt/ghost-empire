// src/lib/youtube.ts
// YouTube Data API v3 — Live Chat helpers for super chat / member event detection.
//
// Quota notes (default: 10,000 units/day):
//   - search.list(eventType=live)  → 100 units (use sparingly — only when no cached liveVideoId)
//   - videos.list                  → 1 unit
//   - liveChatMessages.list        → 5 units (this is the polling target)
//
// Polling math: 5 units * 6 polls/min * 60 min * 3h = 5400 units → ~half daily quota for one 3h stream.
// Caller (cron / admin) is responsible for not polling when not live.
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

const YT_API = "https://www.googleapis.com/youtube/v3";
const YT_OAUTH_TOKEN = "https://oauth2.googleapis.com/token";

export const YT_STREAMER_SCOPES = "openid email profile https://www.googleapis.com/auth/youtube.readonly";

// =====================================================
// Token refresh — YouTube access tokens expire after 1h, refresh always required
// =====================================================

export async function getValidAccessToken(): Promise<string> {
  const tok = await prisma.youTubeStreamerToken.findUnique({ where: { id: "default" } });
  if (!tok) throw new Error("YouTube streamer not authorized — go to /admin#youtube");

  // Refresh if expiring within 2 minutes
  if (tok.tokenExpiresAt.getTime() < Date.now() + 2 * 60_000) {
    const refreshToken = decryptSecret(tok.refreshToken);
    if (!refreshToken) throw new Error("YouTube refresh token unreadable — re-auth at /admin#youtube");
    const refreshed = await refreshAccessToken(refreshToken);
    await prisma.youTubeStreamerToken.update({
      where: { id: "default" },
      data: {
        accessToken: encryptSecret(refreshed.access_token),
        tokenExpiresAt: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000),
      },
    });
    return refreshed.access_token;
  }
  const access = decryptSecret(tok.accessToken);
  if (!access) throw new Error("YouTube access token unreadable — re-auth at /admin#youtube");
  return access;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in?: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  });
  const res = await fetch(YT_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

// =====================================================
// Live broadcast lookup
// =====================================================

type LiveBroadcast = {
  videoId: string;
  liveChatId: string | null;
  title: string;
  startTime: string | null;
};

/**
 * Find the streamer's currently-active live broadcast.
 * Uses liveBroadcasts.list (1 unit) — much cheaper than search.list (100 units).
 */
export async function getActiveLiveBroadcast(token: string): Promise<LiveBroadcast | null> {
  const res = await fetch(
    `${YT_API}/liveBroadcasts?part=snippet,contentDetails&broadcastStatus=active&broadcastType=all&maxResults=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 403) {
    const text = await res.text();
    throw new Error(`YouTube quota/auth error: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`liveBroadcasts.list failed: ${res.status}`);
  }
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;
  return {
    videoId: item.id,
    liveChatId: item.snippet?.liveChatId ?? null,
    title: item.snippet?.title ?? "",
    startTime: item.snippet?.actualStartTime ?? null,
  };
}

// =====================================================
// Live chat messages — incremental polling
// =====================================================

type LiveChatMessage = {
  id: string;
  type: string;          // "textMessageEvent" | "superChatEvent" | "superStickerEvent" | "newSponsorEvent" | "memberMilestoneChatEvent" | ...
  authorChannelId?: string;
  authorDisplayName?: string;
  publishedAt: string;
  message?: string;
  amountMicros?: bigint;
  currency?: string;
  tier?: string;
};

export async function getLiveChatMessages(
  liveChatId: string,
  pageToken: string | null,
  token: string,
): Promise<{ messages: LiveChatMessage[]; nextPageToken: string | null; pollingIntervalMs: number }> {
  const params = new URLSearchParams({
    liveChatId,
    part: "snippet,authorDetails",
    maxResults: "200",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const res = await fetch(`${YT_API}/liveChat/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) {
    // Chat ended (stream went offline mid-poll)
    return { messages: [], nextPageToken: null, pollingIntervalMs: 60_000 };
  }
  if (!res.ok) {
    throw new Error(`liveChatMessages.list failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const messages: LiveChatMessage[] = (data.items ?? []).map((item: Record<string, any>) => {
    const snip = item.snippet ?? {};
    const author = item.authorDetails ?? {};
    const sc = snip.superChatDetails ?? snip.superStickerDetails ?? null;
    return {
      id: item.id,
      type: snip.type as string,
      authorChannelId: author.channelId,
      authorDisplayName: author.displayName,
      publishedAt: snip.publishedAt,
      message: snip.displayMessage ?? snip.textMessageDetails?.messageText ?? sc?.userComment,
      amountMicros: sc?.amountMicros ? BigInt(sc.amountMicros) : undefined,
      currency: sc?.currency,
      tier: sc?.tier?.toString() ?? snip.memberMilestoneChatDetails?.userComment,
    };
  });
  return {
    messages,
    nextPageToken: data.nextPageToken ?? null,
    pollingIntervalMs: Number(data.pollingIntervalMillis ?? 10_000),
  };
}

// =====================================================
// Channel info — for storing channelId + title at auth
// =====================================================

type ChannelInfo = { id: string; title: string };

export async function getOwnChannel(token: string): Promise<ChannelInfo | null> {
  const res = await fetch(`${YT_API}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;
  return { id: item.id, title: item.snippet?.title ?? "" };
}

// =====================================================
// OAuth token exchange (for streamer auth flow)
// =====================================================

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  });
  const res = await fetch(YT_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`YouTube token exchange failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export function getAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YT_STREAMER_SCOPES,
    access_type: "offline",         // required for refresh_token
    prompt: "consent",              // force re-prompt so we always get refresh_token
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
