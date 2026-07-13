// src/lib/webhooks-out.ts
// Outgoing webhooks: POST a JSON payload to external URLs (Discord, n8n, Zapier,
// custom) when a subscribed stream event fires. Best-effort + fire-and-forget from
// the dispatch path; an optional per-hook HMAC secret signs the body. A dead
// endpoint auto-disables after too many consecutive failures.
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { isSafeWebhookUrl } from "@/lib/ssrf-guard";
import { createLogger } from "@/lib/logger";

const log = createLogger("webhooks-out");
const TIMEOUT_MS = 5000;
const AUTO_DISABLE_AT = 20; // consecutive failures before we stop hammering a dead URL

// The event catalog shown in the admin UI — mirrors AlertType in lib/alerts.ts.
export const WEBHOOK_EVENTS = [
  "shop_purchase", "event_win", "drop_claim_bonus", "twitch_sub", "twitch_gift_sub",
  "twitch_cheer", "donation", "welcome", "level_up", "wheel_win",
] as const;

export type WebhookPayload = Record<string, unknown>;

/**
 * Sign a webhook body with a per-hook secret (HMAC-SHA256, hex), in the
 * `sha256=<hex>` form the receiver verifies. Extracted + exported so the
 * signature format is unit-tested — a regression here silently breaks every
 * subscriber's verification.
 */
export function signWebhookBody(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

/** Deliver `event` to every enabled webhook subscribed to it (or to "*"). Per-tenant
 *  (#512): only the portal where the event fired — `tenantId` null = unscoped (legacy). */
async function deliver(event: string, payload: WebhookPayload, tenantId: string | null): Promise<void> {
  let hooks;
  try {
    hooks = await prisma.outgoingWebhook.findMany({ where: { enabled: true, ...(tenantId ? { tenantId } : {}) } });
  } catch {
    return; // never let webhook plumbing break the caller
  }
  const matching = hooks.filter((h) => h.events.includes(event) || h.events.includes("*"));
  if (matching.length === 0) return;

  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });

  await Promise.all(
    matching.map(async (h) => {
      // SSRF guard: never POST to a loopback/private/metadata destination (#audit-H3).
      if (!(await isSafeWebhookUrl(h.url))) {
        log.warn("blocked unsafe outgoing webhook url", { id: h.id });
        return;
      }
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "user-agent": "GhostEmpire-Webhook/1",
        "x-ghostempire-event": event,
      };
      const secret = decryptSecret(h.secret);
      if (secret) {
        headers["x-ghostempire-signature"] = signWebhookBody(secret, body);
      }
      try {
        // redirect:"manual" so a public webhook URL can't 302 into an internal/metadata
        // address (the SSRF guard ran on the original URL only). A 3xx becomes a non-ok
        // response → counted as a failure, never followed.
        const res = await fetch(h.url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
        const nextFail = res.ok ? 0 : h.failCount + 1;
        await prisma.outgoingWebhook.update({
          where: { id: h.id },
          data: {
            lastStatus: res.status,
            lastFiredAt: new Date(),
            failCount: nextFail,
            ...(nextFail >= AUTO_DISABLE_AT ? { enabled: false } : {}),
          },
        });
      } catch {
        const nextFail = h.failCount + 1;
        await prisma.outgoingWebhook
          .update({
            where: { id: h.id },
            data: {
              lastStatus: 0,
              lastFiredAt: new Date(),
              failCount: nextFail,
              ...(nextFail >= AUTO_DISABLE_AT ? { enabled: false } : {}),
            },
          })
          .catch(() => {});
      }
    }),
  );
}

/** Fire-and-forget dispatch — safe to call from any event path; never throws.
 *  Pass the event's `tenantId` so only that portal's webhooks fire. */
export function fireOutgoingWebhooks(event: string, payload: WebhookPayload, tenantId: string | null = null): void {
  void deliver(event, payload, tenantId).catch((e) => log.error("dispatch failed", e, { event }));
}

/** Await a single test delivery to one webhook (admin "test" button). */
export async function testOutgoingWebhook(id: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const h = await prisma.outgoingWebhook.findUnique({ where: { id } });
  if (!h) return { ok: false, status: 0, error: "not_found" };
  // SSRF guard (#audit-H3) — also surfaces the block to the admin via the test button.
  if (!(await isSafeWebhookUrl(h.url))) return { ok: false, status: 0, error: "blocked_url" };

  const body = JSON.stringify({
    event: "test",
    timestamp: new Date().toISOString(),
    data: { message: "Testowy webhook z Ghost Empire 👻", label: h.label },
  });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "GhostEmpire-Webhook/1",
    "x-ghostempire-event": "test",
  };
  const secret = decryptSecret(h.secret);
  if (secret) headers["x-ghostempire-signature"] = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  try {
    // redirect:"manual" — same guard as deliver() (L68): isSafeWebhookUrl only vetted the
    // original URL, so a public host must not be able to 302 the test into an internal /
    // cloud-metadata address. A 3xx is a non-ok response, never followed.
    const res = await fetch(h.url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    await prisma.outgoingWebhook.update({
      where: { id },
      data: { lastStatus: res.status, lastFiredAt: new Date(), failCount: res.ok ? 0 : h.failCount + 1 },
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    await prisma.outgoingWebhook.update({ where: { id }, data: { lastStatus: 0, lastFiredAt: new Date() } }).catch(() => {});
    return { ok: false, status: 0, error: e instanceof Error ? e.message.slice(0, 120) : "network_error" };
  }
}
