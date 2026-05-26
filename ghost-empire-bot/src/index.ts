// src/index.ts — main entry
import { Client, GatewayIntentBits, Events, Partials } from "discord.js";
import { config, startConfigPolling } from "./config.js";
import { setupMessageHandler } from "./handlers/messages.js";
import { setupVoiceTracker } from "./handlers/voice.js";
import { setupCommands } from "./handlers/commands.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,     // PRIVILEGED — enable in Dev Portal
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,       // PRIVILEGED — enable in Dev Portal
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot online: ${c.user.tag}`);
  console.log(`   Guild: ${config.DISCORD_GUILD_ID}`);
  console.log(`   Web API: ${config.WEB_API_URL}`);

  // Start polling /api/bot/config every 60s so admin can tweak rewards live
  startConfigPolling();
  console.log(
    `   Rewards: msg=${config.MESSAGE_REWARD}GT/${config.MESSAGE_COOLDOWN_SECONDS}s, voice=${config.VOICE_REWARD_PER_MINUTE}GT/min`,
  );

  await setupCommands(client);
});

client.on(Events.Error, (err) => {
  console.error("[discord client error]", err);
});

setupMessageHandler(client);
setupVoiceTracker(client);

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`\n${signal} received — wyłączanie bota...`);
  client.destroy().finally(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

client.login(config.DISCORD_BOT_TOKEN).catch((err) => {
  console.error("❌ Login failed:", err);
  process.exit(1);
});
