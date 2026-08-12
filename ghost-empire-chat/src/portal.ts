import { env } from "./env";
import { trackInFlight } from "./shutdown";

type AwardOpts = {
  platform: "twitch" | "kick" | "youtube";
  platformUserId?: string;
  username?: string;
  amount: number;
  reason: string;
};

/**
 * Award tokens to a chatter via the portal. Best-effort, never throws.
 *
 * @remarks Every caller does `void awardChat(...)`, so nobody would notice the request
 * dying with the process on SIGTERM — this call mints currency for a viewer, so it is
 * registered as in-flight work the shutdown drain waits for.
 */
export function awardChat(opts: AwardOpts): Promise<void> {
  return trackInFlight(postAward(opts));
}

async function postAward(opts: AwardOpts): Promise<void> {
  try {
    const res = await fetch(`${env.portalUrl}/api/internal/chat-award`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.botSecret}`,
      },
      body: JSON.stringify(opts),
    });
    if (!res.ok) console.warn(`[portal] chat-award ${res.status}`);
  } catch (e) {
    console.warn("[portal] chat-award failed:", (e as Error).message);
  }
}
