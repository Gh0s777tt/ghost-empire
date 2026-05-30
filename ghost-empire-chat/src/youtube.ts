import { env } from "./env";
import { matchCommand } from "./commands";
import { awardChat } from "./portal";
import { refreshYouTubeToken } from "./youtubeAuth";
import { registerSender, markActivity } from "./broadcast";
import { matchFaq } from "./faq";

// YouTube Live Chat (Option C: authorized as the channel account).
// Quota (10k units/day): liveBroadcasts.list = 1, liveChatMessages.list = 1,
// insert = 50. So reading + GT/min is cheap; replies are throttled to protect quota.
const API = "https://www.googleapis.com/youtube/v3/";
const AWARD_AMOUNT = 1;
const AWARD_COOLDOWN_MS = 60_000; // 1 GT per chatter per minute
const DISCOVERY_INTERVAL_MS = 60_000; // when offline, check for a live broadcast every 60s (1 unit each)
const MIN_SEND_INTERVAL_MS = 5_000; // cap replies (insert = 50 units) — drop, don't queue, if too soon
const MIN_POLL_MS = 3_000;

let accessToken: string | null = null;
let tokenExpiresAt = 0;
let liveChatId: string | null = null;
let ownChannelId: string | null = null;
let nextPageToken: string | undefined;
let primed = false; // first poll only captures the page token (skip chat backlog)
let lastSendAt = 0;
const lastAward = new Map<string, number>();

type BroadcastList = { items?: { snippet?: { liveChatId?: string; channelId?: string } }[] };
type ChatList = {
  nextPageToken?: string;
  pollingIntervalMillis?: number;
  items?: {
    snippet?: { displayMessage?: string };
    authorDetails?: { channelId?: string; displayName?: string };
  }[];
};

async function ensureToken(): Promise<string | null> {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken;
  const t = await refreshYouTubeToken();
  if (t) {
    accessToken = t.access_token;
    tokenExpiresAt = Date.now() + t.expires_in * 1000;
  }
  return accessToken;
}

async function api(path: string, init: RequestInit = {}, retry = true): Promise<Response | null> {
  const token = await ensureToken();
  if (!token) return null;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    authorization: `Bearer ${token}`,
  };
  const res = await fetch(API + path, { ...init, headers });
  if (res.status === 401 && retry) {
    accessToken = null; // force a refresh and retry once
    return api(path, init, false);
  }
  return res;
}

// --- discovery: find the channel's active broadcast + its liveChatId (cheap, owner-only) ---
async function discover(): Promise<void> {
  const res = await api("liveBroadcasts?part=snippet&broadcastStatus=active&broadcastType=all&mine=true");
  if (!res) return;
  if (!res.ok) {
    console.warn(`[youtube] broadcasts ${res.status}`);
    return;
  }
  const data = (await res.json()) as BroadcastList;
  const snippet = data.items?.[0]?.snippet;
  if (snippet?.liveChatId) {
    liveChatId = snippet.liveChatId;
    ownChannelId = snippet.channelId ?? null;
    nextPageToken = undefined;
    primed = false;
    console.log("[youtube] live detected → reading chat");
  }
}

// --- reading: poll liveChatMessages, respecting pollingIntervalMillis ---
async function pollChat(): Promise<number> {
  const qs = new URLSearchParams({ liveChatId: liveChatId as string, part: "snippet,authorDetails" });
  if (nextPageToken) qs.set("pageToken", nextPageToken);
  const res = await api("liveChat/messages?" + qs.toString());
  if (!res) return DISCOVERY_INTERVAL_MS;
  if (res.status === 403 || res.status === 404) {
    console.log("[youtube] live chat ended — back to discovery");
    liveChatId = null;
    return DISCOVERY_INTERVAL_MS;
  }
  if (!res.ok) {
    console.warn(`[youtube] messages ${res.status}`);
    return 10_000;
  }
  const data = (await res.json()) as ChatList;
  nextPageToken = data.nextPageToken;
  const wait = Math.max(data.pollingIntervalMillis ?? 5_000, MIN_POLL_MS);
  if (!primed) {
    primed = true; // skip the historical backlog returned on the first poll
    return wait;
  }
  for (const m of data.items ?? []) handleMessage(m);
  return wait;
}

function handleMessage(m: NonNullable<ChatList["items"]>[number]): void {
  markActivity();
  const text = m.snippet?.displayMessage ?? "";
  const channelId = m.authorDetails?.channelId;
  const username = m.authorDetails?.displayName;

  // award GT (skip our own messages so we don't award/loop on the channel account)
  if (channelId && channelId !== ownChannelId) {
    const now = Date.now();
    if (now - (lastAward.get(channelId) ?? 0) >= AWARD_COOLDOWN_MS) {
      lastAward.set(channelId, now);
      void awardChat({
        platform: "youtube",
        platformUserId: channelId,
        username,
        amount: AWARD_AMOUNT,
        reason: "chat_youtube",
      });
    }
  }

  const reply = matchCommand(text) ?? matchFaq(text);
  if (reply) void sendMessage(reply);
}

// --- sending: liveChatMessages.insert (50 units) — globally throttled ---
async function sendMessage(text: string): Promise<void> {
  if (!liveChatId) return;
  const now = Date.now();
  if (now - lastSendAt < MIN_SEND_INTERVAL_MS) return; // protect quota: drop if too soon
  lastSendAt = now;
  const res = await api("liveChat/messages?part=snippet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      snippet: {
        liveChatId,
        type: "textMessageEvent",
        textMessageDetails: { messageText: text.slice(0, 200) },
      },
    }),
  });
  if (res && !res.ok) console.warn(`[youtube] send ${res.status}: ${(await res.text()).slice(0, 160)}`);
}

async function tick(): Promise<void> {
  let wait = DISCOVERY_INTERVAL_MS;
  try {
    if (!liveChatId) await discover();
    else wait = await pollChat();
  } catch (e) {
    console.warn("[youtube] tick error:", (e as Error).message);
  }
  setTimeout(() => void tick(), wait);
}

export async function startYouTube(): Promise<void> {
  if (!env.youtube.refreshToken) {
    console.log("[youtube] not configured (run `npm run auth:youtube`) — skipping");
    return;
  }
  if (!(await ensureToken())) {
    console.error("[youtube] could not get an access token — check Google creds / refresh token");
    return;
  }
  console.log("[youtube] started — watching for live broadcasts");
  registerSender("youtube", (t) => {
    void sendMessage(t);
  });
  void tick();
}
