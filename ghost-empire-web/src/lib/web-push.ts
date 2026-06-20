// src/lib/web-push.ts
// Web Push delivery (#533). DORMANT until VAPID keys are set AND the
// push_subscriptions table exists — every send is a graceful no-op otherwise, so
// this can ship before the env/db are ready (like the AI features). Node-only
// (web-push uses Node crypto) — import only from Node API routes, never the client.
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

export type PushPayload = { title: string; body: string; url?: string; icon?: string; tag?: string };

let configured: boolean | null = null;

/** True when both VAPID keys are present (the public key is also served to the client). */
export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Lazily wire VAPID once; returns false (dormant) when keys are missing/invalid. */
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@ghost-empire.app";
  if (!pub || !priv) return (configured = false);
  try {
    webpush.setVapidDetails(subject, pub, priv);
    return (configured = true);
  } catch {
    return (configured = false);
  }
}

/** Pure: the small JSON string the service worker receives. Clamps user-facing text. */
export function buildPushPayload(p: PushPayload): string {
  return JSON.stringify({
    title: p.title.slice(0, 120),
    body: p.body.slice(0, 300),
    url: p.url || "/",
    icon: p.icon || "/icons/icon-192.png",
    tag: p.tag,
  });
}

/** Pure: a 404/410 from the push service means the endpoint is dead → delete it. */
export function isGonePushError(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

type SubRow = { endpoint: string; p256dh: string; auth: string };

// Deliver to a set of subscriptions, pruning any the push service reports as gone.
// Best-effort: never throws (callers are often fire-and-forget).
async function deliver(subs: SubRow[], payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  const body = buildPushPayload(payload);
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (isGonePushError(code)) dead.push(s.endpoint);
      }
    }),
  );
  if (dead.length) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } }).catch(() => {});
  }
  return { sent, pruned: dead.length };
}

/** Push to all of one user's devices. No-op when dormant. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { userId }, select: { endpoint: true, p256dh: true, auth: true } }).catch(() => []);
  return deliver(subs, payload);
}

/**
 * Push to every subscriber of ONE tenant/portal. `null` targets the legacy/founder
 * rows (tenantId IS NULL) — NOT every tenant — so one portal's event never leaks to
 * another's subscribers. No-op when dormant.
 */
export async function sendPushToTenant(tenantId: string | null, payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0 };
  const subs = await prisma.pushSubscription
    .findMany({ where: { tenantId }, select: { endpoint: true, p256dh: true, auth: true } })
    .catch(() => []);
  return deliver(subs, payload);
}

/**
 * "Stream is live" push to a portal's subscribers (#534). Dormant-safe and never
 * throws, so callers (the Twitch EventSub webhook) can await it without risk. The
 * `stream-live` tag collapses repeat notifications. Text is an English default for
 * now — a per-tenant custom message is a future enhancement.
 */
export async function notifyStreamLive(tenantId: string | null): Promise<{ sent: number; pruned: number }> {
  if (!isPushConfigured()) return { sent: 0, pruned: 0 };
  let name = "GH0ST EMPIRE";
  if (tenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, ownerHandle: true } }).catch(() => null);
    name = t?.ownerHandle || t?.name || name;
  }
  return sendPushToTenant(tenantId, {
    title: `🔴 ${name} is live!`,
    body: "Tap to watch the stream.",
    url: "/",
    tag: "stream-live",
  });
}

/**
 * "New tip" push to a portal's subscribers (#535). The `donation` tag collapses
 * rapid tips into one updating notification (anti-storm). Dormant-safe; never throws.
 */
export async function notifyDonation(tenantId: string | null, d: { name?: string | null; amount?: number | null; amountLabel?: string | null }): Promise<{ sent: number; pruned: number }> {
  if (!isPushConfigured()) return { sent: 0, pruned: 0 };
  const who = (d.name || "Someone").trim().slice(0, 40) || "Someone";
  const amt = d.amount != null ? ` (${d.amount}${d.amountLabel ? " " + d.amountLabel : ""})` : "";
  return sendPushToTenant(tenantId, {
    title: "💜 New tip!",
    body: `${who} just supported the stream${amt} — thank you!`,
    url: "/support",
    tag: "donation",
  });
}

/** "Goal reached" push to a portal's subscribers (#535) — a rare milestone. Dormant-safe. */
export async function notifyGoalReached(tenantId: string | null, goalTitle: string): Promise<{ sent: number; pruned: number }> {
  if (!isPushConfigured()) return { sent: 0, pruned: 0 };
  return sendPushToTenant(tenantId, {
    title: "🎯 Goal reached!",
    body: goalTitle ? `"${goalTitle.slice(0, 80)}" — thank you all! 💜` : "Thank you all! 💜",
    url: "/support",
    tag: "goal-reached",
  });
}
