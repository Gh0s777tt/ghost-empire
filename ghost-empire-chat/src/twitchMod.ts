// src/twitchMod.ts
// Helix-based moderation (delete message / timeout user). tmi.js sends the old
// `/delete` and `/timeout` IRC commands, which Twitch REMOVED in Feb 2023 — they
// silently no-op, so until now only the warn path actually worked. The official
// path is the Helix moderation API + the scopes:
//   moderator:manage:chat_messages  (delete a message)
//   moderator:manage:banned_users   (timeout / ban)
// Grant them by re-running `npm run auth:twitch` (the scope list now includes them).
//
// DEGRADES GRACEFULLY: if the token lacks the scopes, the ids can't be resolved,
// or a call fails, isModEnabled() stays false / the call returns false and the
// caller falls back to a chat warning — i.e. exactly the pre-existing behavior, so
// enabling this can never make moderation worse than it already was.
import { env } from "./env";

const HELIX = "https://api.twitch.tv/helix";
const MAX_TIMEOUT_SECS = 1_209_600; // Twitch hard cap = 14 days

let broadcasterId: string | null = null;
let moderatorId: string | null = null;
let enabled = false;
let tokenGetter: () => string | null = () => null;

async function helixUserId(token: string, login: string): Promise<string | null> {
  try {
    const r = await fetch(`${HELIX}/users?login=${encodeURIComponent(login)}`, {
      headers: { authorization: `Bearer ${token}`, "client-id": env.twitch.clientId ?? "" },
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { data?: Array<{ id: string }> };
    return data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function tokenHasModScopes(token: string): Promise<boolean> {
  try {
    const r = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { authorization: `OAuth ${token}` },
    });
    if (!r.ok) return false;
    const scopes = ((await r.json()) as { scopes?: string[] }).scopes ?? [];
    return (
      scopes.includes("moderator:manage:chat_messages") &&
      scopes.includes("moderator:manage:banned_users")
    );
  } catch {
    return false;
  }
}

/**
 * Resolve broadcaster + moderator ids and verify scopes ONCE at startup.
 * `getToken` returns the current raw access token (kept fresh by twitch.ts).
 */
export async function initTwitchMod(getToken: () => string | null): Promise<void> {
  tokenGetter = getToken;
  const token = getToken();
  if (!token || !env.twitch.clientId) {
    console.warn("[twitch-mod] no token / TWITCH_CLIENT_ID — automod stays WARN-ONLY");
    return;
  }
  if (!(await tokenHasModScopes(token))) {
    console.warn(
      "[twitch-mod] token lacks moderator:manage:* scopes — automod is WARN-ONLY. " +
        "Run `npm run auth:twitch` (re-authorize) to enable real delete/timeout.",
    );
    return;
  }
  broadcasterId = await helixUserId(token, env.twitch.channel);
  moderatorId = await helixUserId(token, env.twitch.username);
  if (!broadcasterId || !moderatorId) {
    console.warn("[twitch-mod] could not resolve broadcaster/moderator id — automod stays WARN-ONLY");
    return;
  }
  enabled = true;
  console.log("[twitch-mod] Helix moderation ENABLED (delete + timeout)");
}

export function isModEnabled(): boolean {
  return enabled;
}

/** Delete a single message via Helix. Returns true if the API accepted it. */
export async function deleteMessage(messageId: string): Promise<boolean> {
  const token = tokenGetter();
  if (!enabled || !token) return false;
  try {
    const r = await fetch(
      `${HELIX}/moderation/chat?broadcaster_id=${broadcasterId}&moderator_id=${moderatorId}&message_id=${messageId}`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}`, "client-id": env.twitch.clientId ?? "" } },
    );
    return r.ok || r.status === 204;
  } catch {
    return false;
  }
}

/** Timeout a user for N seconds via Helix. Returns true if accepted. */
export async function timeoutUser(userId: string, seconds: number, reason: string): Promise<boolean> {
  const token = tokenGetter();
  if (!enabled || !token) return false;
  try {
    const r = await fetch(`${HELIX}/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${moderatorId}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "client-id": env.twitch.clientId ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: {
          user_id: userId,
          duration: Math.max(1, Math.min(MAX_TIMEOUT_SECS, Math.round(seconds))),
          reason: reason.slice(0, 500),
        },
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
