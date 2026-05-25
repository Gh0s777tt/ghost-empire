// src/config.ts
import "dotenv/config";

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`❌ Missing required env var: ${key}`);
    console.error(`   Skopiuj .env.example jako .env i uzupełnij wartości.`);
    process.exit(1);
  }
  return v;
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) {
    console.error(`❌ Invalid integer for ${key}: ${v}`);
    process.exit(1);
  }
  return n;
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (!v) return fallback;
  return v === "true" || v === "1";
}

export const config = {
  DISCORD_BOT_TOKEN:  required("DISCORD_BOT_TOKEN"),
  DISCORD_CLIENT_ID:  required("DISCORD_CLIENT_ID"),
  DISCORD_GUILD_ID:   required("DISCORD_GUILD_ID"),
  WEB_API_URL:        process.env.WEB_API_URL ?? "http://localhost:3000",
  BOT_SECRET:         required("BOT_SECRET"),

  MESSAGE_REWARD:           int("MESSAGE_REWARD", 5),
  MESSAGE_COOLDOWN_SECONDS: int("MESSAGE_COOLDOWN_SECONDS", 60),
  VOICE_REWARD_PER_MINUTE:  int("VOICE_REWARD_PER_MINUTE", 10),
  VOICE_TICK_SECONDS:       int("VOICE_TICK_SECONDS", 60),
  AFK_GIVES_REWARD:         bool("AFK_GIVES_REWARD", false),
  MUTED_GIVES_REWARD:       bool("MUTED_GIVES_REWARD", true),
};
