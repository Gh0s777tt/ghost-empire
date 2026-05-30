import tmi from "tmi.js";
import { env } from "./env";
import { matchCommand } from "./commands";
import { awardChat } from "./portal";

const AWARD_AMOUNT = 1;
const AWARD_COOLDOWN_MS = 60_000; // 1 GT per chatter per minute
const lastAward = new Map<string, number>();

export function startTwitch(): void {
  if (!env.twitch.oauth) {
    console.error("[twitch] TWITCH_BOT_OAUTH not set — run `npm run auth:twitch` first.");
    return;
  }

  const client = new tmi.Client({
    identity: { username: env.twitch.username, password: env.twitch.oauth },
    channels: [env.twitch.channel],
  });

  client.on("connected", () =>
    console.log(`[twitch] connected as ${env.twitch.username} in #${env.twitch.channel}`),
  );

  client.on("message", (_channel, tags, message, self) => {
    if (self) return;

    // 1) custom command response
    const reply = matchCommand(message);
    if (reply) client.say(env.twitch.channel, reply).catch(() => {});

    // 2) GT for chatting (per-user cooldown), matched by Twitch user-id
    const userId = tags["user-id"];
    if (userId) {
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

  client.connect().catch((e) => console.error("[twitch] connect failed:", e));
}
