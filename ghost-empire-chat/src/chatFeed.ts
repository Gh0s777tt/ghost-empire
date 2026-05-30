// Chat overlay feed — forwards each incoming chat message to the portal so the
// /overlay/chat OBS browser source can show combined Twitch+Kick+YouTube chat.
// Best-effort, fire-and-forget: never blocks or throws into the message handler.
import { env } from "./env";

export function pushChatFeed(platform: string, username: string | undefined, message: string): void {
  void fetch(`${env.portalUrl}/api/internal/chat-feed`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.botSecret}` },
    body: JSON.stringify({ platform, username: username ?? "widz", message }),
  }).catch(() => {});
}
