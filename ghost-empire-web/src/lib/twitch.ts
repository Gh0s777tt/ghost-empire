// src/lib/twitch.ts
// Twitch Helix API + EventSub helpers.
import { createHmac, timingSafeEqual } from "node:crypto";
import { httpFetch } from "@/lib/http";

const HELIX = "https://api.twitch.tv/helix";

// === App Access Token (cached in-memory) ===
let cachedAppToken: { token: string; expiresAt: number } | null = null;

export async function getAppAccessToken(): Promise<string> {
  if (cachedAppToken && cachedAppToken.expiresAt > Date.now() + 60_000) {
    return cachedAppToken.token;
  }
  const body = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID ?? "",
    client_secret: process.env.TWITCH_CLIENT_SECRET ?? "",
    grant_type: "client_credentials",
  });
  const res = await httpFetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`getAppAccessToken failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cachedAppToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

// === Helix calls ===
export async function helixGet<T = unknown>(
  path: string,
  token: string,
): Promise<T> {
  const res = await httpFetch(`${HELIX}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": process.env.TWITCH_CLIENT_ID ?? "",
    },
  });
  if (!res.ok) {
    throw new Error(`Helix GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function helixPost<T = unknown>(
  path: string,
  body: unknown,
  token: string,
): Promise<T> {
  const res = await httpFetch(`${HELIX}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": process.env.TWITCH_CLIENT_ID ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Helix POST ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function helixDelete(path: string, token: string): Promise<void> {
  const res = await httpFetch(`${HELIX}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": process.env.TWITCH_CLIENT_ID ?? "",
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Helix DELETE ${path} failed: ${res.status} ${await res.text()}`);
  }
}

// === User lookup ===
type TwitchUser = { id: string; login: string; display_name: string };

export async function getUserByLogin(login: string, appToken: string): Promise<TwitchUser | null> {
  const data = await helixGet<{ data: TwitchUser[] }>(`/users?login=${login}`, appToken);
  return data.data[0] ?? null;
}

export async function getUserById(id: string, appToken: string): Promise<TwitchUser | null> {
  const data = await helixGet<{ data: TwitchUser[] }>(`/users?id=${id}`, appToken);
  return data.data[0] ?? null;
}

// === EventSub subscription management ===
export const WEBHOOK_URL = (process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app")
  + "/api/webhooks/twitch-eventsub";

export const EVENT_TYPES_TO_SUBSCRIBE = [
  { type: "channel.subscribe", version: "1" },
  { type: "channel.subscription.gift", version: "1" },
  { type: "channel.cheer", version: "1" },
  { type: "channel.hype_train.begin", version: "1" },
  { type: "channel.hype_train.progress", version: "1" },
  { type: "channel.hype_train.end", version: "1" },
  // Broadcast on/off → per-stream sessions ("czas na streamie" analytics)
  { type: "stream.online", version: "1" },
  { type: "stream.offline", version: "1" },
  // New followers → "last follower" widget. v2 needs moderator_user_id in the
  // condition + the broadcaster must have granted `moderator:read:followers`.
  { type: "channel.follow", version: "2" },
] as const;

type CreateEventSubBody = {
  type: string;
  version: string;
  condition: Record<string, string>;
  transport: {
    method: "webhook";
    callback: string;
    secret: string;
  };
};

export async function createEventSubscription(
  type: string,
  version: string,
  broadcasterId: string,
  appToken: string,
): Promise<{ id: string; status: string; type: string }> {
  const secret = process.env.TWITCH_EVENTSUB_SECRET;
  if (!secret) throw new Error("TWITCH_EVENTSUB_SECRET not set");

  // channel.follow v2 requires a moderator_user_id alongside the broadcaster
  // (here the broadcaster moderates their own channel).
  const condition: Record<string, string> =
    type === "channel.follow"
      ? { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId }
      : { broadcaster_user_id: broadcasterId };

  const body: CreateEventSubBody = {
    type,
    version,
    condition,
    transport: {
      method: "webhook",
      callback: WEBHOOK_URL,
      secret,
    },
  };
  const result = await helixPost<{ data: { id: string; status: string; type: string }[] }>(
    "/eventsub/subscriptions",
    body,
    appToken,
  );
  return result.data[0];
}

export async function listEventSubscriptions(appToken: string): Promise<Array<{
  id: string;
  type: string;
  status: string;
  created_at: string;
  condition: Record<string, string>;
}>> {
  const result = await helixGet<{ data: Array<{ id: string; type: string; status: string; created_at: string; condition: Record<string, string> }> }>(
    "/eventsub/subscriptions",
    appToken,
  );
  return result.data;
}

export async function deleteEventSubscription(id: string, appToken: string): Promise<void> {
  await helixDelete(`/eventsub/subscriptions?id=${id}`, appToken);
}

// === Signature verification ===
export function verifyEventSubSignature(
  messageId: string,
  timestamp: string,
  body: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const secret = process.env.TWITCH_EVENTSUB_SECRET;
  if (!secret) return false;
  const message = messageId + timestamp + body;
  const expected = "sha256=" + createHmac("sha256", secret).update(message).digest("hex");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signatureHeader, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// === Time-based replay protection (Twitch sends timestamp on each message) ===
export function isMessageFresh(timestamp: string, maxAgeMinutes = 10): boolean {
  const messageTime = new Date(timestamp).getTime();
  if (Number.isNaN(messageTime)) return false;
  // age > 0 = past, < 0 = future. Reject replays (too old) AND spoofed far-future
  // timestamps; tolerate ~2 min of clock skew on the future side.
  const age = Date.now() - messageTime;
  return age < maxAgeMinutes * 60_000 && age > -2 * 60_000;
}
