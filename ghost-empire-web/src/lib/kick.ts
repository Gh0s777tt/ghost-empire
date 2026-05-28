// src/lib/kick.ts
// Kick public API + webhook helpers — mirror of lib/twitch.ts for the Kick platform.
//
// Auth model:
//   - App token (client_credentials) — for app-level operations like fetching public key
//   - User token (streamer OAuth) — required to create webhook subscriptions for a channel
//
// Webhook signature: Kick signs each webhook with RSA-SHA256 using their public key
// (fetched once from /public-key, cached). Signed payload format:
//   `${messageId}.${timestamp}.${body}`
import { createPublicKey, createVerify, KeyObject } from "node:crypto";

const KICK_API = "https://api.kick.com/public/v1";
const KICK_OAUTH_TOKEN = "https://id.kick.com/oauth/token";

export const KICK_STREAMER_SCOPES = "user:read channel:read events:subscribe";

// =====================================================
// App access token — cached, refreshed when within 5 min of expiry
// =====================================================

let cachedAppToken: { token: string; expiresAt: number } | null = null;

export async function getAppAccessToken(): Promise<string> {
  if (cachedAppToken && cachedAppToken.expiresAt > Date.now() + 5 * 60_000) {
    return cachedAppToken.token;
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.KICK_CLIENT_ID ?? "",
    client_secret: process.env.KICK_CLIENT_SECRET ?? "",
  });
  const res = await fetch(KICK_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`getAppAccessToken failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  cachedAppToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

// =====================================================
// User token exchange + refresh (for streamer auth flow)
// =====================================================

export async function exchangeUserCode(code: string, redirectUri: string, codeVerifier?: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: process.env.KICK_CLIENT_ID ?? "",
    client_secret: process.env.KICK_CLIENT_SECRET ?? "",
  });
  if (codeVerifier) body.set("code_verifier", codeVerifier);

  const res = await fetch(KICK_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Kick token exchange failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// =====================================================
// Channel / user lookup
// =====================================================

export type KickUser = { userId: string; name: string };

/**
 * Fetch the authenticated user's Kick profile. Kick's /public/v1/users returns
 * a `data[]` array; the field for the handle is `username` (NOT `name`), and the
 * id may come as `user_id` or `id` depending on API version — normalize both.
 */
export async function getOwnUser(userAccessToken: string): Promise<KickUser | null> {
  const res = await fetch(`${KICK_API}/users`, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  if (!res.ok) {
    console.error(`[kick] getOwnUser failed: ${res.status} ${await res.text().catch(() => "")}`);
    return null;
  }
  const data = await res.json();
  const raw = Array.isArray(data?.data) ? data.data[0] : data;
  if (!raw) return null;
  const userId = (raw.user_id ?? raw.id)?.toString();
  const name = raw.username ?? raw.name ?? raw.slug ?? "";
  if (!userId) return null;
  return { userId, name };
}

// =====================================================
// Webhook subscriptions — list / create / delete
// =====================================================

export const KICK_EVENT_TYPES_TO_SUBSCRIBE = [
  { name: "channel.subscription.new",     version: 1 },
  { name: "channel.subscription.renewal", version: 1 },
  { name: "channel.subscription.gifts",   version: 1 },
  { name: "channel.followed",             version: 1 },
  { name: "livestream.status.updated",    version: 1 },
] as const;

export async function listEventSubscriptions(appToken: string): Promise<Array<{
  id: string;
  event: string;
  version: number;
  method: string;
  created_at: string;
  updated_at: string;
}>> {
  const res = await fetch(`${KICK_API}/events/subscriptions`, {
    headers: { Authorization: `Bearer ${appToken}` },
  });
  if (!res.ok) {
    throw new Error(`listEventSubscriptions failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return Array.isArray(data?.data) ? data.data : [];
}

export type CreateSubsResult = {
  status: number;
  rawBody: string;
  created: Array<{ name: string; version: number; subscription_id: string; error?: string }>;
};

/**
 * Create webhook event subscriptions for the streamer.
 *
 * NOTE: with a USER access token (the streamer's), Kick defaults broadcaster_user_id
 * to the token owner — we deliberately DON'T send it (sending it has been observed to
 * cause silent no-ops / 400s). Returns the raw status + body so the caller can surface
 * exactly what Kick said instead of guessing.
 */
export async function createEventSubscriptions(
  types: Array<{ name: string; version: number }>,
  userAccessToken: string,
): Promise<CreateSubsResult> {
  const res = await fetch(`${KICK_API}/events/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "webhook", types }),
  });
  const rawBody = await res.text();
  let created: CreateSubsResult["created"] = [];
  try {
    const data = JSON.parse(rawBody);
    if (Array.isArray(data?.data)) created = data.data;
  } catch {
    /* non-JSON — leave created empty, rawBody carries the diagnostic */
  }
  return { status: res.status, rawBody, created };
}

export async function deleteEventSubscription(id: string, userAccessToken: string): Promise<void> {
  const res = await fetch(`${KICK_API}/events/subscriptions?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`deleteEventSubscription failed: ${res.status} ${await res.text()}`);
  }
}

// =====================================================
// Webhook signature verification (RSA-SHA256)
// =====================================================

let cachedPublicKey: { key: KeyObject; fetchedAt: number } | null = null;
const PUBLIC_KEY_TTL_MS = 24 * 60 * 60 * 1000; // refresh daily

async function getPublicKey(): Promise<KeyObject> {
  if (cachedPublicKey && Date.now() - cachedPublicKey.fetchedAt < PUBLIC_KEY_TTL_MS) {
    return cachedPublicKey.key;
  }
  const res = await fetch(`${KICK_API}/public-key`);
  if (!res.ok) throw new Error(`Failed to fetch Kick public key: ${res.status}`);
  const data = await res.json();
  const pem = data?.data?.public_key;
  if (!pem) throw new Error("Kick public key missing in response");
  const key = createPublicKey(pem);
  cachedPublicKey = { key, fetchedAt: Date.now() };
  return key;
}

/**
 * Verify a Kick webhook signature.
 * Payload signed by Kick: `${messageId}.${timestamp}.${body}` with RSA-SHA256.
 * Header `Kick-Event-Signature` is the base64-encoded signature.
 */
export async function verifyKickSignature(
  messageId: string,
  timestamp: string,
  body: string,
  signatureBase64: string | null,
): Promise<boolean> {
  if (!signatureBase64) return false;
  try {
    const publicKey = await getPublicKey();
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${messageId}.${timestamp}.${body}`);
    verifier.end();
    return verifier.verify(publicKey, signatureBase64, "base64");
  } catch (e) {
    console.error("[kick] signature verify failed:", e);
    return false;
  }
}

// Replay protection — reject messages older than 10 minutes
export function isMessageFresh(timestamp: string, maxAgeMinutes = 10): boolean {
  const messageTime = new Date(timestamp).getTime();
  if (Number.isNaN(messageTime)) return false;
  return Math.abs(Date.now() - messageTime) < maxAgeMinutes * 60_000;
}

// =====================================================
// User OAuth authorize URL
// =====================================================

export function getStreamerAuthorizeUrl(state: string, codeChallenge: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.KICK_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: KICK_STREAMER_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://id.kick.com/oauth/authorize?${params.toString()}`;
}
