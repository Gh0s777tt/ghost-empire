import tmi from "tmi.js";
import { startTimestampPrune } from "./pruneMap";
import { env } from "./env";
import { matchCommand } from "./commands";
import { checkRaffleEntry } from "./raffle";
import { matchFaq } from "./faq";
import { welcomeMessage, welcomeBonus } from "./welcome";
import { isSongRequest, handleSongRequest } from "./songRequest";
import { checkMessage, violationLabel, escalate, logViolation } from "./moderation";
import { initTwitchMod, deleteMessage, timeoutUser } from "./twitchMod";
import { isAiTrigger, handleAiTrigger } from "./aiCommands";
import { isGtGameTrigger, handleGtGame } from "./gtGames";
import { isDuelTrigger, handleDuel } from "./gtDuel";
import { isHeistTrigger, handleHeist } from "./heist";
import { trackEmojis } from "./emojiCombo";
import { pushChatFeed } from "./chatFeed";
import { awardChat } from "./portal";
import { refreshAccessToken } from "./twitchAuth";
import { registerSender, markActivity } from "./broadcast";

const AWARD_AMOUNT = 1;
const AWARD_COOLDOWN_MS = 60_000; // 1 GT per chatter per minute
const REFRESH_EVERY_MS = 3 * 60 * 60 * 1000; // refresh token every 3h (expires ~4h)
const lastAward = new Map<string, number>();
startTimestampPrune(lastAward, AWARD_COOLDOWN_MS); // przeciw wyciekowi pamięci (długi proces)

let client: tmi.Client | null = null;
// Current raw access token (no "oauth:" prefix) — used by the Helix moderation
// calls. Kept in sync with the chat token in startTwitch + the refresh interval.
let currentToken: string | null = null;

function build(password: string): tmi.Client {
  const c = new tmi.Client({
    identity: { username: env.twitch.username, password },
    channels: [env.twitch.channel],
  });

  registerSender("twitch", (t) => {
    c.say(env.twitch.channel, t).catch(() => {});
  });

  c.on("connected", () =>
    console.log(`[twitch] connected as ${env.twitch.username} in #${env.twitch.channel}`),
  );

  c.on("message", (_channel, tags, message, self) => {
    if (self) return;
    markActivity();

    // Automod first — offending messages are removed/timed-out and skip the chat
    // feed, commands and the GT award. Requires the bot to be a Twitch moderator.
    const isSub = Boolean(tags.subscriber) || tags.badges?.subscriber != null;
    const isMod = Boolean(tags.mod) || tags.badges?.broadcaster != null;
    const verdict = checkMessage(message, { isSub, isVip: tags.badges?.vip != null, isMod });
    if (verdict) {
      const u = tags.username ?? "";
      // Escalate repeat offenders (harsher action / longer timeout), then log for stats.
      const v = escalate("twitch", u, verdict);
      // Enforce via Helix (tmi.js's IRC /delete + /timeout were removed by Twitch
      // in 2023 and silently no-op). If Helix moderation isn't enabled (no scopes)
      // or the call fails, fall back to a chat warning — same as the old behavior.
      const warn = () => { if (u) c.say(env.twitch.channel, `@${u} ⚠️ ${violationLabel(v.violation)}`).catch(() => {}); };
      const targetId = tags["user-id"];
      if (v.action === "delete" && tags.id) {
        void deleteMessage(tags.id).then((ok) => { if (!ok) warn(); });
      } else if (v.action === "timeout" && targetId) {
        void timeoutUser(targetId, v.timeoutSecs, violationLabel(v.violation)).then((ok) => { if (!ok) warn(); });
      } else {
        warn();
      }
      logViolation("twitch", u, v.violation, v.action, v.priorCount);
      return;
    }

    pushChatFeed("twitch", tags.username, message, { emotes: tags.emotes, badges: tags.badges });
    trackEmojis(message);
    checkRaffleEntry("twitch", tags.username, message, isSub, isMod);

    if (isAiTrigger(message)) {
      void handleAiTrigger(tags.username, message).then((r) => {
        if (r) c.say(env.twitch.channel, r).catch(() => {});
      });
    } else if (isGtGameTrigger(message)) {
      void handleGtGame("twitch", tags["user-id"], tags.username, message).then((r) => {
        if (r) c.say(env.twitch.channel, r).catch(() => {});
      });
    } else if (isDuelTrigger(message)) {
      void handleDuel("twitch", tags["user-id"], tags.username, message).then((r) => {
        if (r) c.say(env.twitch.channel, r).catch(() => {});
      });
    } else if (isHeistTrigger(message)) {
      void handleHeist("twitch", tags["user-id"], tags.username, message).then((r) => {
        if (r) c.say(env.twitch.channel, r).catch(() => {});
      });
    } else if (isSongRequest(message)) {
      void handleSongRequest("twitch", tags.username, message).then((m) => {
        if (m) c.say(env.twitch.channel, m).catch(() => {});
      });
    } else {
      const reply = matchCommand(message) ?? matchFaq(message);
      if (reply) c.say(env.twitch.channel, reply).catch(() => {});
    }

    const userId = tags["user-id"];
    if (userId) {
      const greet = welcomeMessage("twitch", userId, tags.username);
      if (greet) {
        c.say(env.twitch.channel, greet).catch(() => {});
        const bonus = welcomeBonus();
        if (bonus > 0) void awardChat({ platform: "twitch", platformUserId: userId, username: tags.username, amount: bonus, reason: "welcome_twitch" });
      }
      const now = Date.now();
      if (now - (lastAward.get(userId) ?? 0) >= AWARD_COOLDOWN_MS) {
        lastAward.set(userId, now);
        void awardChat({
          platform: "twitch",
          platformUserId: userId,
          username: tags.username,
          amount: AWARD_AMOUNT,
          reason: "chat_twitch",
        });
      }
    }
  });

  return c;
}

// Prefer a freshly-refreshed token; fall back to the static one from .env.
// Also records the raw token (no "oauth:" prefix) for the Helix moderation calls.
async function resolvePassword(): Promise<string | null> {
  const token = await refreshAccessToken();
  if (token) {
    currentToken = token;
    return "oauth:" + token;
  }
  if (env.twitch.oauth) {
    console.warn("[twitch] refresh unavailable — using static TWITCH_BOT_OAUTH (will expire)");
    currentToken = env.twitch.oauth.replace(/^oauth:/, "");
    return env.twitch.oauth;
  }
  return null;
}

export async function startTwitch(): Promise<void> {
  const password = await resolvePassword();
  if (!password) {
    console.error("[twitch] no token — run `npm run auth:twitch` first.");
    return;
  }

  client = build(password);
  await client.connect().catch((e) => console.error("[twitch] connect failed:", e));

  // Resolve ids + verify mod scopes once (warn-only fallback if unavailable).
  await initTwitchMod(() => currentToken);

  // Proactively refresh + reconnect before the token expires.
  setInterval(async () => {
    const fresh = await refreshAccessToken();
    if (!fresh || !client) return;
    currentToken = fresh; // keep the Helix moderation token fresh too
    try {
      await client.disconnect();
    } catch {
      /* already down */
    }
    client = build("oauth:" + fresh);
    try {
      await client.connect();
      console.log("[twitch] token refreshed + reconnected");
    } catch (e) {
      console.error("[twitch] reconnect failed:", e);
    }
  }, REFRESH_EVERY_MS);
}
