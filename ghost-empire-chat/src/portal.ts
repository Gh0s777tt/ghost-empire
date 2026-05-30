import { env } from "./env";

type AwardOpts = {
  platform: "twitch" | "kick" | "youtube";
  platformUserId?: string;
  username?: string;
  amount: number;
  reason: string;
};

/** Award Ghost Tokens to a chatter via the portal. Best-effort, never throws. */
export async function awardChat(opts: AwardOpts): Promise<void> {
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
