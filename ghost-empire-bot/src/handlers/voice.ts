// src/handlers/voice.ts — tick every N seconds and award everyone currently in voice
import { Client } from "discord.js";
import { config, runtimeConfig } from "../config.js";
import { awardTokens } from "../api.js";

export function setupVoiceTracker(client: Client) {
  // Use static interval — tick rate not changed at runtime to keep timer logic simple.
  // VOICE_TICK_SECONDS env can be changed but requires bot restart.
  setInterval(async () => {
    // Skip if disabled via admin panel
    if (!runtimeConfig.enabled) return;

    const guild = client.guilds.cache.get(config.DISCORD_GUILD_ID);
    if (!guild) {
      console.warn(`[voice] guild ${config.DISCORD_GUILD_ID} not in cache`);
      return;
    }

    const activeUsers: Array<{ id: string; username: string }> = [];

    for (const [, channel] of guild.channels.cache) {
      if (!channel.isVoiceBased()) continue;

      // Skip AFK channel unless explicitly allowed (live config)
      if (!runtimeConfig.afkGivesReward && channel.id === guild.afkChannelId) continue;

      for (const [memberId, member] of channel.members) {
        if (member.user.bot) continue;
        const vs = member.voice;
        if (!vs) continue;

        // Skip self-muted / server-muted users if configured
        if (!runtimeConfig.mutedGivesReward && (vs.selfMute || vs.serverMute)) continue;

        // Skip server-deafened (they can't even hear, definitely not active)
        if (vs.serverDeaf) continue;

        activeUsers.push({ id: memberId, username: member.user.username });
      }
    }

    if (activeUsers.length === 0) return;
    console.log(`[voice tick] ${activeUsers.length} active users`);

    // Proportional reward based on tick length
    const reward = Math.max(
      1,
      Math.round((runtimeConfig.voiceRewardPerMinute * runtimeConfig.voiceTickSeconds) / 60),
    );

    for (const u of activeUsers) {
      const result = await awardTokens({
        discordId: u.id,
        amount: reward,
        reason: "voice",
      });
      if ("ok" in result && result.ok && "awarded" in result) {
        console.log(`[voice] ${u.username} +${result.awarded} GT`);
      }
    }
  }, runtimeConfig.voiceTickSeconds * 1000);
}
