// src/config.ts
import "dotenv/config";

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
  return v;
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (!v) return fallback;
  return v === "true" || v === "1";
}

// Static config — Discord + web API connection. Cannot change at runtime.
export const config = {
  DISCORD_BOT_TOKEN:  required("DISCORD_BOT_TOKEN"),
  DISCORD_CLIENT_ID:  required("DISCORD_CLIENT_ID"),
  DISCORD_GUILD_ID:   required("DISCORD_GUILD_ID"),
  WEB_API_URL:        process.env.WEB_API_URL ?? "http://localhost:3000",
  BOT_SECRET:         required("BOT_SECRET"),

  // Initial defaults; overridden by /api/bot/config every 60s
  MESSAGE_REWARD:           int("MESSAGE_REWARD", 5),
  MESSAGE_COOLDOWN_SECONDS: int("MESSAGE_COOLDOWN_SECONDS", 60),
  VOICE_REWARD_PER_MINUTE:  int("VOICE_REWARD_PER_MINUTE", 10),
  VOICE_TICK_SECONDS:       int("VOICE_TICK_SECONDS", 60),
  AFK_GIVES_REWARD:         bool("AFK_GIVES_REWARD", false),
  MUTED_GIVES_REWARD:       bool("MUTED_GIVES_REWARD", true),
};

// Mutable runtime config — fetched from /api/bot/config periodically.
// Modifications via web admin panel take effect within ~60 seconds.
export const runtimeConfig = {
  messageReward:           config.MESSAGE_REWARD,
  messageCooldownSeconds:  config.MESSAGE_COOLDOWN_SECONDS,
  voiceRewardPerMinute:    config.VOICE_REWARD_PER_MINUTE,
  voiceTickSeconds:        config.VOICE_TICK_SECONDS,
  afkGivesReward:          config.AFK_GIVES_REWARD,
  mutedGivesReward:        config.MUTED_GIVES_REWARD,
  enabled:                 true,
};

const FETCH_INTERVAL_MS = 60_000;

export async function fetchRuntimeConfig(): Promise<void> {
  try {
    const res = await fetch(`${config.WEB_API_URL}/api/bot/config`);
    if (!res.ok) {
      console.warn(`[config] fetch failed (${res.status}) — using cached values`);
      return;
    }
    const data = await res.json();
    if (typeof data.messageReward === "number") runtimeConfig.messageReward = data.messageReward;
    if (typeof data.messageCooldownSeconds === "number") runtimeConfig.messageCooldownSeconds = data.messageCooldownSeconds;
    if (typeof data.voiceRewardPerMinute === "number") runtimeConfig.voiceRewardPerMinute = data.voiceRewardPerMinute;
    if (typeof data.voiceTickSeconds === "number") runtimeConfig.voiceTickSeconds = data.voiceTickSeconds;
    if (typeof data.afkGivesReward === "boolean") runtimeConfig.afkGivesReward = data.afkGivesReward;
    if (typeof data.mutedGivesReward === "boolean") runtimeConfig.mutedGivesReward = data.mutedGivesReward;
    if (typeof data.enabled === "boolean") runtimeConfig.enabled = data.enabled;
  } catch (e) {
    console.warn("[config] fetch error — using cached values:", e);
  }
}

export function startConfigPolling(): void {
  fetchRuntimeConfig();
  setInterval(fetchRuntimeConfig, FETCH_INTERVAL_MS);
}
