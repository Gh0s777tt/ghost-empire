// src/app/api/streamdeck/trigger/route.ts
// Stream Deck / Bitfocus Companion → overlay-trigger endpoint.
//
// Why this exists: a physical Stream Deck switches OBS scenes over obs-websocket on its own, but
// firing PLATFORM overlay alerts needs an HTTP call INTO this app. The whole admin API is
// cookie-gated (a browser session), which a desktop macro pad can't hold. This is the one
// token-authed door for it — narrow ON PURPOSE: it enqueues overlay alerts and nothing else (no
// economy, no admin), so a token leaked from a desktop can at worst spam a portal's own overlay.
// Auth is a per-tenant `Tenant.streamDeckToken` (encrypted at-rest, minted reveal-once via
// /api/admin/streamdeck-token); the tenant is resolved from the Host header, never the body —
// same rule as every other tenant-scoped route (a body-supplied portal would be forgeable).
//
// `/api/*` is excluded from `proxy.ts`, so this route does its own gate (repo convention).
//
//   POST { action: "test" }                     → fire the built-in test alert
//   POST { action: "custom_fire", id: "<id>" }  → fire a saved Custom Alert by id
//
// The switch is intentionally small (alert-domain only, zero economy mutation) so v1 ships safe;
// economy/event actions (drop, draw, goal_reset, subathon…) are a deliberate later slice that
// reuses the same token — see docs/OBS-CONTROL.md.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId, getCurrentTenant } from "@/lib/tenant";
import { decryptSecret } from "@/lib/crypto";
import { verifyStreamDeckTokenForTenant } from "@/lib/utils";
import { dispatchAlert } from "@/lib/alerts";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Pre-auth throttle by client IP, BEFORE the token read. `/api/*` is off `proxy.ts` and each
  // call costs a DB lookup to fetch the token, so an anonymous flood of bad tokens could amplify
  // DB reads (pool is small). Key by IP — NOT tenant — so an attacker hammering a portal's host
  // can't exhaust that portal's own post-auth button budget below; a real Stream Deck sits behind
  // one IP and stays far under this. 256-bit tokens already make guessing infeasible; this only
  // caps the load of trying. (#security-review 2026-08)
  const ipRl = await rateLimit(`streamdeck-ip:${clientIp(req)}`, 120, 60_000);
  if (!ipRl.allowed) {
    return NextResponse.json({ error: "Za szybko" }, { status: 429, headers: rateLimitHeaders(ipRl) });
  }

  // Tenant from Host (subdomain), never the body. A null id = pre-tenant-row (legacy/apex) where
  // there is no per-portal token to check against → reject rather than fall through to anything.
  const tid = await currentTenantId();
  if (!tid) {
    return NextResponse.json({ error: "Brak portalu dla tego hosta" }, { status: 404 });
  }

  // SINGLE decrypt point for `streamDeckToken`: this route is its only reader. decryptSecret
  // passes legacy plaintext through unchanged and returns null on ENCRYPTION_KEY drift → the token
  // simply won't match (fail-closed), never a crash. Verified constant-time, no global master-key.
  const row = await prisma.tenant.findUnique({ where: { id: tid }, select: { streamDeckToken: true } });
  const token = decryptSecret(row?.streamDeckToken ?? null);
  if (!verifyStreamDeckTokenForTenant(req.headers.get("authorization"), token)) {
    return NextResponse.json({ error: "Nieprawidłowy token" }, { status: 401 });
  }

  // A physical button gets mashed; cap well above human cadence but below a runaway loop. Keyed
  // per-tenant (one token = one portal), so one portal can't exhaust another's budget.
  const rl = await rateLimit(`streamdeck:${tid}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za szybko" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  let body: { action?: unknown; id?: unknown };
  try { body = (await req.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";

  switch (action) {
    case "test": {
      // Mirrors the admin "Test alert" button (StreamAlerts) — same payload, this portal's own
      // token symbol so an overlay preview never wears the founder's currency. NOTE: "test" must
      // be in enabledTypes (Stream Alerts settings) or dispatchAlert silently drops it → we report
      // `dropped` so a Companion feedback can tell "sent" from "muted-by-settings".
      const tenant = await getCurrentTenant();
      const alert = await dispatchAlert(
        {
          type: "test",
          title: "🧪 Test alert",
          message: "Jeśli to widzisz na overlay — działa!",
          icon: "🧪",
          actorName: "Stream Deck",
          amount: 1337,
          amountLabel: tenant.tokenSymbol,
        },
        tid,
      );
      return NextResponse.json({ ok: true, alertId: alert?.id ?? null, dropped: alert === null });
    }

    case "custom_fire": {
      // Fire a saved Custom Alert by id (tenant-scoped). Mirrors admin custom-alerts "fire":
      // enqueue directly with type "custom", which bypasses the per-type enable filter, so a
      // custom alert always shows regardless of the enabledTypes toggles.
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
      const ca = await prisma.customAlert.findFirst({ where: { id, tenantId: tid } });
      if (!ca) return NextResponse.json({ error: "Nie znaleziono alertu" }, { status: 404 });
      const alert = await prisma.streamAlert.create({
        data: {
          tenantId: tid,
          type: "custom",
          title: ca.title,
          message: ca.message,
          icon: ca.icon,
          amount: ca.amount,
          amountLabel: ca.amountLabel,
          meta: ca.accent ? JSON.stringify({ accent: ca.accent }) : null,
        },
        select: { id: true },
      });
      return NextResponse.json({ ok: true, alertId: alert.id });
    }

    default:
      return NextResponse.json({ error: "action: test | custom_fire" }, { status: 400 });
  }
}
