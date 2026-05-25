// src/handlers/messages.ts — award tokens for Discord messages with anti-spam cooldown
import { Client, Events, Message } from "discord.js";
import { config } from "../config.js";
import { awardTokens } from "../api.js";

// In-memory cooldown map. Resets on bot restart (intentional — easier than persisting).
const userCooldowns = new Map<string, number>();

// Prune cooldown map periodically so it doesn't grow unbounded across long uptimes.
setInterval(() => {
  const cutoff = Date.now() - config.MESSAGE_COOLDOWN_SECONDS * 1000;
  for (const [uid, ts] of userCooldowns) {
    if (ts < cutoff) userCooldowns.delete(uid);
  }
}, 5 * 60 * 1000);

export function setupMessageHandler(client: Client) {
  client.on(Events.MessageCreate, async (msg: Message) => {
    // Skip bots, DMs, wrong guild, sticker-only/empty messages, commands
    if (msg.author.bot) return;
    if (!msg.guild || msg.guild.id !== config.DISCORD_GUILD_ID) return;
    if (msg.content.trim().length < 2) return;
    if (msg.content.startsWith("!") || msg.content.startsWith("/")) return;

    // Cooldown per user
    const last = userCooldowns.get(msg.author.id) ?? 0;
    const now = Date.now();
    if (now - last < config.MESSAGE_COOLDOWN_SECONDS * 1000) return;
    userCooldowns.set(msg.author.id, now);

    const result = await awardTokens({
      discordId: msg.author.id,
      amount: config.MESSAGE_REWARD,
      reason: "message",
    });

    if ("ok" in result && result.ok && "awarded" in result) {
      console.log(
        `[msg] ${msg.author.username} (${msg.author.id}) +${result.awarded} GT → ${result.newBalance}`,
      );
    } else if ("ok" in result && !result.ok && "reason" in result) {
      // User not linked yet — silent
      console.log(`[msg] ${msg.author.username} not linked`);
    }
  });
}
