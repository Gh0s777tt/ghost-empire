// src/api.ts — HTTP client to ghost-empire-web internal endpoints
import { config } from "./config.js";

type AwardResponse =
  | { ok: true; awarded: number; newBalance: number }
  | { ok: false; reason?: string }
  | { error: string };

export async function awardTokens(params: {
  discordId: string;
  amount: number;
  reason: string;
  multiplier?: number;
}): Promise<AwardResponse> {
  try {
    const res = await fetch(`${config.WEB_API_URL}/api/internal/award`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.BOT_SECRET}`,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[api/award] ${res.status}:`, data);
      return { error: data.error ?? `HTTP ${res.status}` };
    }
    return data;
  } catch (e) {
    console.error("[api/award] network error:", e);
    return { error: "network" };
  }
}

type LinkResponse =
  | { ok: true; userId: string }
  | { error: string };

export async function linkDiscord(params: {
  code: string;
  discordId: string;
  discordUsername: string;
}): Promise<LinkResponse> {
  try {
    const res = await fetch(`${config.WEB_API_URL}/api/internal/link-discord`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.BOT_SECRET}`,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: data.error ?? `HTTP ${res.status}` };
    }
    return data;
  } catch (e) {
    console.error("[api/link] network error:", e);
    return { error: "Brak połączenia z portalem" };
  }
}
