import tmi from "tmi.js";
import { env } from "./env";
import { matchCommand } from "./commands";
import { matchFaq } from "./faq";
import { welcomeMessage, welcomeBonus } from "./welcome";
import { isSongRequest, handleSongRequest } from "./songRequest";
import { pushChatFeed } from "./chatFeed";
import { awardChat } from "./portal";
import { refreshAccessToken } from "./twitchAuth";
import { registerSender, markActivity } from "./broadcast";

const AWARD_AMOUNT = 1;
const AWARD_COOLDOWN_MS = 60_000; // 1 GT per chatter per minute
const REFRESH_EVERY_MS = 3 * 60 * 60 * 1000; // refresh token every 3h (expires ~4h)
const lastAward = new Map<string, number>();

let client: tmi.Client | null = null;

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
    pushChatFeed("twitch", tags.username, message);

    if (isSongRequest(message)) {
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
async function resolvePassword(): Promise<string | null> {
  const token = await refreshAccessToken();
  if (token) return "oauth:" + token;
  if (env.twitch.oauth) {
    console.warn("[twitch] refresh unavailable — using static TWITCH_BOT_OAUTH (will expire)");
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

  // Proactively refresh + reconnect before the token expires.
  setInterval(async () => {
    const fresh = await refreshAccessToken();
    if (!fresh || !client) return;
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
