import { env } from "./env";
import { matchCommand } from "./commands";
import { matchFaq } from "./faq";
import { awardChat } from "./portal";
import { refreshKickToken } from "./kickAuth";
import { registerSender, markActivity } from "./broadcast";

const AWARD_AMOUNT = 1;
const AWARD_COOLDOWN_MS = 60_000; // 1 GT per chatter per minute
const REFRESH_EVERY_MS = 60 * 60 * 1000; // proactively refresh the send-token hourly (backstop)
const RECONNECT_MS = 5_000;
const PING_EVERY_MS = 60_000; // keepalive: Pusher's activity_timeout is 120s — ping well under it
const CHAT_EVENT = "App\\Events\\ChatMessageEvent"; // Pusher event name = literal  App\Events\ChatMessageEvent

const lastAward = new Map<string, number>();
let sendToken: string | null = null;

type KickChat = {
  content?: string;
  sender?: { id?: number; username?: string };
};

// --- reading: unauthenticated Pusher websocket (same outbound pattern as Twitch IRC) ---

function pusherUrl(): string {
  return `wss://ws-us2.pusher.com/app/${env.kick.pusherKey}?protocol=7&client=js&version=8.4.0-rc2&flash=false`;
}

// Look up the numeric chatroom id the Pusher channel is keyed on. Prefer the
// explicit env override; otherwise hit Kick's public channel endpoint (may be
// Cloudflare-gated from some networks — fall back to KICK_CHATROOM_ID then).
async function resolveChatroomId(): Promise<string | null> {
  if (env.kick.chatroomId) return env.kick.chatroomId;
  if (!env.kick.channel) return null;
  try {
    const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(env.kick.channel)}`, {
      headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
    });
    if (!r.ok) {
      console.warn(`[kick] channel lookup ${r.status} — set KICK_CHATROOM_ID in .env`);
      return null;
    }
    const data = (await r.json()) as { chatroom?: { id?: number } };
    return data.chatroom?.id ? String(data.chatroom.id) : null;
  } catch (e) {
    console.warn("[kick] channel lookup failed — set KICK_CHATROOM_ID:", (e as Error).message);
    return null;
  }
}

function handleChat(d: KickChat): void {
  markActivity();
  const content = d.content ?? "";
  const userId = d.sender?.id != null ? String(d.sender.id) : undefined;
  const username = d.sender?.username;

  const reply = matchCommand(content) ?? matchFaq(content);
  if (reply) void sendKickMessage(reply);

  if (userId) {
    const now = Date.now();
    if (now - (lastAward.get(userId) ?? 0) >= AWARD_COOLDOWN_MS) {
      lastAward.set(userId, now);
      void awardChat({
        platform: "kick",
        platformUserId: userId,
        username,
        amount: AWARD_AMOUNT,
        reason: "chat_kick",
      });
    }
  }
}

function handleEnvelope(ws: WebSocket, channel: string, msg: { event?: string; data?: unknown }): void {
  switch (msg.event) {
    case "pusher:connection_established":
      ws.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel } }));
      return;
    case "pusher_internal:subscription_succeeded":
      console.log(`[kick] subscribed to ${channel}`);
      return;
    case "pusher:ping":
      ws.send(JSON.stringify({ event: "pusher:pong", data: {} }));
      return;
    case CHAT_EVENT: {
      try {
        const data = typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;
        handleChat(data as KickChat);
      } catch {
        /* malformed payload */
      }
      return;
    }
  }
}

function connect(chatroomId: string): void {
  const channel = `chatrooms.${chatroomId}.v2`;
  const ws = new WebSocket(pusherUrl());
  let ping: ReturnType<typeof setInterval> | undefined;

  ws.addEventListener("open", () => {
    console.log(`[kick] ws open → subscribing ${channel}`);
    ping = setInterval(() => ws.send(JSON.stringify({ event: "pusher:ping", data: {} })), PING_EVERY_MS);
  });
  ws.addEventListener("message", (ev: MessageEvent) => {
    try {
      const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
      handleEnvelope(ws, channel, JSON.parse(raw));
    } catch {
      /* non-JSON frame */
    }
  });
  ws.addEventListener("error", () => console.error("[kick] ws error"));
  ws.addEventListener("close", () => {
    if (ping) clearInterval(ping);
    console.warn(`[kick] ws closed — reconnecting in ${RECONNECT_MS / 1000}s`);
    setTimeout(() => connect(chatroomId), RECONNECT_MS);
  });
}

// --- sending: official API (chat:write). type "bot" posts to the TOKEN OWNER's own channel,
// so to reply in the streamer's chat we send type "user" targeting their broadcaster_user_id
// (the bot account must be a mod/granted bot on that channel). ---

async function sendKickMessage(content: string, retry = true): Promise<void> {
  if (!sendToken) return;
  if (!env.kick.broadcasterId) {
    console.warn("[kick] KICK_BROADCASTER_ID not set — can't target the channel; skipping reply");
    return;
  }
  try {
    const r = await fetch("https://api.kick.com/public/v1/chat", {
      method: "POST",
      headers: { authorization: `Bearer ${sendToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        broadcaster_user_id: Number(env.kick.broadcasterId),
        content: content.slice(0, 500),
        type: "user",
      }),
    });
    if (r.status === 401 && retry) {
      await refreshSendToken();
      return sendKickMessage(content, false); // token expired mid-stream — refresh once and retry
    }
    if (!r.ok) console.warn(`[kick] send ${r.status}: ${(await r.text()).slice(0, 160)}`);
  } catch (e) {
    console.warn("[kick] send failed:", (e as Error).message);
  }
}

async function refreshSendToken(): Promise<void> {
  const fresh = await refreshKickToken();
  if (fresh) {
    sendToken = fresh;
    return;
  }
  if (!sendToken && env.kick.token) {
    console.warn("[kick] refresh unavailable — using static KICK_BOT_TOKEN (will expire)");
    sendToken = env.kick.token;
  }
}

export async function startKick(): Promise<void> {
  if (!env.kick.channel && !env.kick.chatroomId) {
    console.log("[kick] not configured (set KICK_CHANNEL / KICK_CHATROOM_ID) — skipping");
    return;
  }

  const chatroomId = await resolveChatroomId();
  if (!chatroomId) {
    console.error("[kick] no chatroom id — set KICK_CHATROOM_ID in .env");
    return;
  }

  await refreshSendToken();
  if (!sendToken) {
    console.warn("[kick] no chat token — reading + awarding only (run `npm run auth:kick` to enable replies)");
  }

  connect(chatroomId);
  registerSender("kick", (t) => {
    void sendKickMessage(t);
  });
  setInterval(() => void refreshSendToken(), REFRESH_EVERY_MS);
}
