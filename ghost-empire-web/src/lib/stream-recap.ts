// src/lib/stream-recap.ts
// AI Stream Recap (#516): after a stream, summarize it (duration, top events, top
// chatters/supporters, GT earned) with the shared aiChat and optionally post to a
// Discord webhook. Tenant-scoped content; the recap WINDOW comes from the last
// StreamSession (or a 6h fallback). Degrades gracefully when AI isn't configured.
import { prisma } from "@/lib/prisma";
import { aiChat } from "@/lib/ai";
import { getIntegrationConfig } from "@/lib/integrations";
import { createLogger } from "@/lib/logger";

const log = createLogger("recap");

export type RecapData = {
  startedAt: string;
  endedAt: string;
  durationMin: number;
  subs: number;
  donations: number;
  follows: number;
  gtEarned: number;
  messages: number;
  topChatters: { name: string; count: number }[];
  topSupporters: { name: string; amount: number }[];
};

const tw = (tid: string | null) => (tid ? { tenantId: tid } : {});

/** Gather the recap stats over the last stream's window (tenant-scoped content). */
export async function gatherRecapData(tenantId: string | null): Promise<RecapData> {
  const session = await prisma.streamSession.findFirst({ orderBy: { startedAt: "desc" } }).catch(() => null);
  const sixHoursAgo = new Date(Date.now() - 6 * 3600_000);
  const start = session?.startedAt ?? sixHoursAgo;
  const end = session?.endedAt ?? new Date();
  const win = { createdAt: { gte: start } };

  const [byType, gt, messages, chatters, supporters] = await Promise.all([
    prisma.streamAlert.groupBy({ by: ["type"], where: { ...win, ...tw(tenantId) }, _count: { _all: true } }).catch(() => []),
    prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: "earn", createdAt: { gte: start }, ...(tenantId ? { user: { tenantId: tenantId } } : {}) } }).catch(() => ({ _sum: { amount: null } })),
    prisma.chatFeedMessage.count({ where: { ...win, ...tw(tenantId) } }).catch(() => 0),
    prisma.chatFeedMessage.groupBy({ by: ["username"], where: { ...win, ...tw(tenantId) }, _count: { _all: true }, orderBy: { _count: { username: "desc" } }, take: 5 }).catch(() => []),
    prisma.streamAlert.groupBy({ by: ["actorName"], where: { type: "donation", ...win, ...tw(tenantId) }, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } }, take: 5 }).catch(() => []),
  ]);

  const countOf = (types: string[]) => byType.filter((r) => types.includes(r.type)).reduce((s, r) => s + r._count._all, 0);

  return {
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    durationMin: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)),
    subs: countOf(["twitch_sub", "twitch_gift_sub", "kick_sub"]),
    donations: countOf(["donation"]),
    follows: countOf(["twitch_follow"]),
    gtEarned: gt._sum.amount ?? 0,
    messages,
    topChatters: chatters.map((c) => ({ name: c.username, count: c._count._all })),
    topSupporters: supporters.filter((s) => s.actorName).map((s) => ({ name: s.actorName as string, amount: s._sum.amount ?? 0 })),
  };
}

/** Build the AI prompt from recap stats. Pure → unit-tested. */
export function buildRecapPrompt(data: RecapData, locale: string): { system: string; user: string } {
  const system = [
    "You write a short, upbeat post-stream recap for a Twitch/Kick streamer's community Discord.",
    `Write in the language of locale "${locale}".`,
    "Be warm and fun, 4–8 short lines, light emoji. Open with a one-line vibe, then the highlights as a tidy list, then a thank-you. Use ONLY the numbers given — never invent events, names or amounts. Skip a stat if it's zero.",
  ].join("\n");
  const user = [
    `Duration: ${data.durationMin} min`,
    `New subs: ${data.subs}`,
    `Donations: ${data.donations}`,
    `New follows: ${data.follows}`,
    `Ghost Tokens earned by viewers: ${data.gtEarned}`,
    `Chat messages: ${data.messages}`,
    `Top chatters: ${data.topChatters.map((c) => `${c.name} (${c.count})`).join(", ") || "—"}`,
    `Top supporters: ${data.topSupporters.map((s) => `${s.name} (${s.amount})`).join(", ") || "—"}`,
  ].join("\n");
  return { system, user };
}

export type RecapResult =
  | { ok: true; text: string; data: RecapData }
  | { ok: false; reason: "no-ai" | "ai-failed"; data: RecapData };

/** Generate the recap text via AI. Distinguishes "no AI key" from "AI call failed". */
export async function generateRecap(tenantId: string | null, locale = "pl"): Promise<RecapResult> {
  const data = await gatherRecapData(tenantId);
  const cfg = await getIntegrationConfig();
  if (!cfg.aiApiKey) return { ok: false, reason: "no-ai", data };
  const { system, user } = buildRecapPrompt(data, locale);
  const text = await aiChat([{ role: "system", content: system }, { role: "user", content: user }], { maxTokens: 600, temperature: 0.7 });
  if (!text) return { ok: false, reason: "ai-failed", data };
  return { ok: true, text, data };
}

/** Post the recap to a Discord webhook. Returns success. */
export async function sendRecapToDiscord(webhookUrl: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text.slice(0, 1900) }), // Discord hard limit 2000
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch (e) {
    log.error("discord post failed", e);
    return false;
  }
}
