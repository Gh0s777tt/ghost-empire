// src/app/api/admin/kick-events/route.ts
// Setup / list / delete Kick webhook subscriptions. Mirror of admin/twitch-eventsub.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import {
  getAppAccessToken,
  listEventSubscriptions,
  createEventSubscriptions,
  deleteEventSubscription,
  KICK_EVENT_TYPES_TO_SUBSCRIBE,
} from "@/lib/kick";
import { getKickStreamerToken, getValidKickAccessToken } from "@/lib/platform-tokens";
import { OAuthTokenError } from "@/lib/oauth-refresh";
import { createLogger } from "@/lib/logger";

const log = createLogger("kick-events");

/**
 * Turn an {@link OAuthTokenError} into the message the admin sees.
 *
 * Kick needs the *streamer's* token to create/delete subscriptions, and that token expires in about
 * an hour — so before the refresh flow existed this route failed on a dead credential nearly every
 * time it was used, with only Kick's raw `401` body to explain it. Splitting `reauth_required`
 * (click Connect again) from `refresh_failed` (Kick is unhappy, try later) is the difference
 * between a fixable error and a mystery.
 *
 * @remarks The re-auth wording stays generic on purpose: `reauth_required` covers both "never
 * connected" and "the grant died", and the admin's next step is the same button either way.
 */
function kickAuthMessage(e: OAuthTokenError): string {
  return e.code === "refresh_failed"
    ? "Kick chwilowo nie odświeżył tokenu streamera — spróbuj ponownie za chwilę."
    : "Połączenie z Kickiem wymaga ponownej autoryzacji — kliknij 'Autoryzuj Kick'.";
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [streamerToken, local, recentEvents] = await Promise.all([
    getKickStreamerToken(),
    prisma.kickEventSubscription.findMany({ orderBy: { type: "asc" } }),
    prisma.kickEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 10 }),
  ]);

  let remote: Awaited<ReturnType<typeof listEventSubscriptions>> = [];
  try {
    const appToken = await getAppAccessToken();
    remote = await listEventSubscriptions(appToken);
  } catch (e) {
    log.error("list failed", e);
  }

  return NextResponse.json({
    streamerConnected: !!streamerToken,
    broadcasterLogin: streamerToken?.broadcasterLogin ?? null,
    broadcasterId: streamerToken?.broadcasterId ?? null,
    connectedAt: streamerToken?.connectedAt.toISOString() ?? null,
    subscriptions: local.map((s) => ({
      id: s.id,
      type: s.type,
      lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
    remote,
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      type: e.type,
      userId: e.userId,
      tokensGranted: e.tokensGranted,
      receivedAt: e.receivedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: string; id?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "setup") {
    const streamerToken = await getKickStreamerToken();
    if (!streamerToken) {
      return NextResponse.json({
        error: "Streamer Kick jeszcze nie autoryzowany — kliknij 'Autoryzuj Kick' najpierw",
      }, { status: 400 });
    }

    // Identify which types we still need to subscribe to (idempotent setup)
    const existing = await prisma.kickEventSubscription.findMany({
      where: { broadcasterId: streamerToken.broadcasterId },
      select: { type: true },
    });
    const existingTypes = new Set(existing.map((e) => e.type));
    const toCreate = KICK_EVENT_TYPES_TO_SUBSCRIBE.filter((t) => !existingTypes.has(t.name));

    if (toCreate.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Wszystkie typy już zasubskrybowane",
        results: [],
      });
    }

    // Refresh-on-read: the stored access token is ~1 h old at best by the time an admin clicks
    // this, so resolve a fresh one instead of decrypting a likely-dead credential.
    let userToken: string;
    try {
      userToken = await getValidKickAccessToken();
    } catch (e) {
      if (e instanceof OAuthTokenError) {
        log.warn("setup blocked — Kick credentials unusable", { code: e.code });
        return NextResponse.json({ error: kickAuthMessage(e), authCode: e.code }, { status: 400 });
      }
      throw e;
    }

    const results: Array<{ type: string; ok: boolean; id?: string; error?: string }> = [];
    let kickStatus = 0;
    let kickRaw = "";
    try {
      const resp = await createEventSubscriptions(
        toCreate.map((t) => ({ name: t.name, version: t.version })),
        userToken,
      );
      kickStatus = resp.status;
      kickRaw = resp.rawBody.slice(0, 800);

      for (const c of resp.created) {
        const ok = !!c.subscription_id && !c.error;
        if (ok) {
          await prisma.kickEventSubscription.create({
            data: {
              id: c.subscription_id,
              type: c.name,
              broadcasterId: streamerToken.broadcasterId,
            },
          }).catch(() => {});
        }
        results.push({ type: c.name, ok, id: c.subscription_id, error: c.error });
      }

      // Kick returned non-2xx, or 2xx but created nothing → surface the raw body
      if (kickStatus >= 400 || resp.created.length === 0) {
        return NextResponse.json(
          {
            error: `Kick odrzucił request (HTTP ${kickStatus}). Odpowiedź: ${kickRaw || "(pusta)"}`,
            kickStatus,
            kickRaw,
            results,
          },
          { status: kickStatus >= 400 ? 502 : 200 },
        );
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "setup_failed", results },
        { status: 500 },
      );
    }

    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "kick_events_setup",
      details: { results, broadcasterId: streamerToken.broadcasterId, kickStatus },
      req,
    });

    return NextResponse.json({ ok: true, results, kickStatus });
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    let userToken: string;
    try {
      userToken = await getValidKickAccessToken();
    } catch (e) {
      if (e instanceof OAuthTokenError) {
        log.warn("delete blocked — Kick credentials unusable", { code: e.code });
        return NextResponse.json({ error: kickAuthMessage(e), authCode: e.code }, { status: 400 });
      }
      throw e;
    }
    try {
      await deleteEventSubscription(body.id, userToken);
      await prisma.kickEventSubscription.delete({ where: { id: body.id } }).catch(() => {});
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "delete_failed" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: "action: setup | delete" }, { status: 400 });
}
