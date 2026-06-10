// src/app/api/admin/twitch-eventsub/route.ts
// Create / list / delete EventSub subscriptions for the broadcaster.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import {
  getAppAccessToken,
  createEventSubscription,
  listEventSubscriptions,
  deleteEventSubscription,
  EVENT_TYPES_TO_SUBSCRIBE,
} from "@/lib/twitch";
import { getTwitchStreamerToken } from "@/lib/platform-tokens";

// GET — current Twitch subscriptions state + streamer connection info
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const streamerToken = await getTwitchStreamerToken();
  const local = await prisma.twitchEventSubscription.findMany({
    orderBy: { type: "asc" },
  });

  let remote: Awaited<ReturnType<typeof listEventSubscriptions>> = [];
  try {
    const appToken = await getAppAccessToken();
    remote = await listEventSubscriptions(appToken);
  } catch (e) {
    console.error("[twitch-eventsub] list failed:", e);
  }

  return NextResponse.json({
    streamerConnected: !!streamerToken,
    broadcasterId: streamerToken?.broadcasterId ?? null,
    broadcasterLogin: streamerToken?.broadcasterLogin ?? null,
    local,
    remote,
  });
}

// POST { action: "setup" | "delete", id? }
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: string; id?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  if (body.action === "setup") {
    const streamerToken = await getTwitchStreamerToken();
    if (!streamerToken) {
      return NextResponse.json({
        error: "Streamer Twitch jeszcze nie autoryzowany — kliknij 'Autoryzuj jako streamer' najpierw",
      }, { status: 400 });
    }

    const appToken = await getAppAccessToken();
    const results: Array<{ type: string; ok: boolean; id?: string; status?: string; error?: string }> = [];

    for (const { type, version } of EVENT_TYPES_TO_SUBSCRIBE) {
      // Skip if already exists (idempotent)
      const existing = await prisma.twitchEventSubscription.findFirst({
        where: { type, broadcasterId: streamerToken.broadcasterId },
      });
      if (existing) {
        results.push({ type, ok: true, id: existing.id, status: "already_exists" });
        continue;
      }

      try {
        const sub = await createEventSubscription(type, version, streamerToken.broadcasterId, appToken);
        await prisma.twitchEventSubscription.create({
          data: {
            id: sub.id,
            type: sub.type,
            status: sub.status,
            broadcasterId: streamerToken.broadcasterId,
          },
        });
        results.push({ type, ok: true, id: sub.id, status: sub.status });
      } catch (e) {
        results.push({
          type,
          ok: false,
          error: e instanceof Error ? e.message.slice(0, 200) : "unknown",
        });
      }
    }

    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "twitch_eventsub_setup",
      details: { results, broadcasterId: streamerToken.broadcasterId },
      req,
    });

    return NextResponse.json({ ok: true, results });
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    const appToken = await getAppAccessToken();
    try {
      await deleteEventSubscription(body.id, appToken);
      await prisma.twitchEventSubscription.delete({ where: { id: body.id } }).catch(() => {});
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "delete_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "action: setup | delete" }, { status: 400 });
}
