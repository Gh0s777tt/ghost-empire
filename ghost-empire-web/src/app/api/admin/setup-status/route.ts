// src/app/api/admin/setup-status/route.ts
// Admin: a quick "what's configured" checklist for the dashboard, so the streamer can
// see at a glance what still needs setting up (and jump straight to the section).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getIntegrationConfig } from "@/lib/integrations";
import { getTwitchStreamerToken, getKickStreamerToken, getYouTubeStreamerToken } from "@/lib/platform-tokens";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [integ, mod, twitch, twitchSubs, kick, youtube, alertSettings] = await Promise.all([
    getIntegrationConfig(),
    prisma.moderationConfig.findFirst(),
    getTwitchStreamerToken(),
    prisma.twitchEventSubscription.count(),
    getKickStreamerToken(),
    getYouTubeStreamerToken(),
    prisma.streamAlertSettings.findFirst(),
  ]);

  const items = [
    { key: "ai",         label: "Klucz AI (postać @bot + !imagine)", ok: !!integ.aiApiKey,              section: "integrations", hint: "Wklej klucz AI w sekcji Integracje", optional: true },
    { key: "twitch",     label: "Twitch połączony (EventSub)",        ok: !!twitch?.broadcasterId,       section: "twitch",       hint: "Połącz konto streamera w sekcji Twitch" },
    { key: "twitchSubs", label: "Subskrypcje EventSub utworzone",      ok: twitchSubs > 0,                section: "twitch",       hint: "Kliknij Utwórz subskrypcje w sekcji Twitch" },
    { key: "kick",       label: "Kick połączony",                      ok: !!kick,                        section: "kick",         hint: "Połącz Kicka", optional: true },
    { key: "youtube",    label: "YouTube połączony",                   ok: !!youtube,                     section: "youtube",      hint: "Połącz YouTube", optional: true },
    { key: "moderation", label: "Moderacja czatu włączona",            ok: !!mod?.enabled,                section: "moderation",   hint: "Włącz reguły w sekcji Moderacja", optional: true },
    { key: "overlay",    label: "Token overlayu OBS",                  ok: !!alertSettings?.overlayToken, section: "alerts",       hint: "Wejdź w Stream Alerts, by wygenerować" },
  ];

  return NextResponse.json({ items });
}
