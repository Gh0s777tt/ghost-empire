// Liveness ping → portal (POST /api/bot/heartbeat, Bearer BOT_SECRET) every
// minute, so the admin panel can show "bot online/offline" instead of the
// owner guessing whether the process is alive. Best-effort, never throws —
// a portal outage must not take the bot down.
import { env } from "./env";

const INTERVAL_MS = 60_000;

function configuredPlatforms(): string[] {
  const platforms = ["twitch"]; // Twitch env is required, the bot always joins it
  if (env.kick.channel) platforms.push("kick");
  if (env.youtube.refreshToken) platforms.push("youtube");
  return platforms;
}

async function beat(): Promise<void> {
  try {
    const res = await fetch(`${env.portalUrl}/api/bot/heartbeat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.botSecret}`,
      },
      body: JSON.stringify({ platforms: configuredPlatforms() }),
    });
    if (!res.ok) console.warn(`[heartbeat] portal answered ${res.status}`);
  } catch (e) {
    console.warn("[heartbeat] failed:", (e as Error).message);
  }
}

export function startHeartbeat(): void {
  void beat(); // first beat immediately, so the panel flips to "online" on boot
  setInterval(() => void beat(), INTERVAL_MS);
  console.log("[heartbeat] every 60s →", `${env.portalUrl}/api/bot/heartbeat`);
}
