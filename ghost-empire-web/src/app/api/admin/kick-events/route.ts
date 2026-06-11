// src/app/api/admin/kick-events/route.ts
// Setup / list / delete Kick webhook subscriptions. Mirror of admin/twitch-eventsub.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { decryptSecret } from "@/lib/crypto";
import {
  getAppAccessToken,
  listEventSubscriptions,
  createEventSubscriptions,
  deleteEventSubscription,
  KICK_EVENT_TYPES_TO_SUBSCRIBE,
} from "@/lib/kick";
import { getKickStreamerToken } from "@/lib/platform-tokens";
import { createLogger } from "@/lib/logger";

const log = createLogger("kick-events");

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

    const results: Array<{ type: string; ok: boolean; id?: string; error?: string }> = [];
    let kickStatus = 0;
    let kickRaw = "";
    try {
      const resp = await createEventSubscriptions(
        toCreate.map((t) => ({ name: t.name, version: t.version })),
        decryptSecret(streamerToken.accessToken) ?? "",
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
    const streamerToken = await getKickStreamerToken();
    if (!streamerToken) {
      return NextResponse.json({ error: "Brak Kick streamer tokenu" }, { status: 400 });
    }
    try {
      await deleteEventSubscription(body.id, decryptSecret(streamerToken.accessToken) ?? "");
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
