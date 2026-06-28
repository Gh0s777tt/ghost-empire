// src/app/api/admin/setup-status/route.ts
// Admin "what's configured" checklist + the data behind the go-live SETUP WIZARD (#737). GET
// derives per-step completion from real config (so it self-heals), computes progress, and tells
// the UI whether to auto-open the wizard. POST records the wizard's own done/snooze state.
// Per-step labels/hints render from i18n (admin.setupStatus.item.<key>.*); the strings below are
// only the Polish fallback for the existing dashboard card.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getIntegrationConfig } from "@/lib/integrations";
import { getSettings as getAlertSettings } from "@/lib/alerts";
import { getTwitchStreamerToken, getKickStreamerToken, getYouTubeStreamerToken } from "@/lib/platform-tokens";
import { currentTenantId } from "@/lib/tenant";
import { computeSetupProgress, shouldAutoOpenWizard } from "@/lib/setup-status";

export const dynamic = "force-dynamic";

// Polish fallback labels/hints (the card prefers i18n `item.<key>.label`/`.hint`, falls back here).
const LABELS: Record<string, { label: string; hint: string }> = {
  twitch: { label: "Twitch połączony (EventSub)", hint: "Połącz konto streamera w sekcji Twitch" },
  twitchSubs: { label: "Subskrypcje EventSub utworzone", hint: "Kliknij Utwórz subskrypcje w sekcji Twitch" },
  overlay: { label: "Token overlayu OBS", hint: "Wejdź w Stream Alerts, by wygenerować token i URL źródła OBS" },
  kick: { label: "Kick połączony", hint: "Połącz Kicka w sekcji Kick" },
  youtube: { label: "YouTube połączony", hint: "Połącz YouTube w sekcji YouTube" },
  moderation: { label: "Moderacja czatu włączona", hint: "Włącz reguły automoderacji w sekcji Moderacja" },
  ai: { label: "Klucz AI (postać @bot + !imagine)", hint: "Wklej klucz AI w sekcji Integracje" },
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const [integ, mod, twitch, kick, youtube, alertSettings, tenant] = await Promise.all([
    getIntegrationConfig(),
    tid ? prisma.moderationConfig.findUnique({ where: { tenantId: tid } }) : prisma.moderationConfig.findFirst({ where: { tenantId: null } }),
    getTwitchStreamerToken(),
    getKickStreamerToken(),
    getYouTubeStreamerToken(),
    getAlertSettings(),
    tid ? prisma.tenant.findUnique({ where: { id: tid }, select: { createdAt: true, setupCompletedAt: true, setupDismissedAt: true } }) : null,
  ]);

  // EventSub subscriptions are keyed by the channel's broadcasterId (the table has no tenantId),
  // so scope the count to THIS portal's connected Twitch channel — a global count() would let one
  // portal's subscriptions mark another portal's "EventSub created" step done (#743). No connected
  // broadcaster → no subs yet → 0.
  const twitchSubs = twitch?.broadcasterId
    ? await prisma.twitchEventSubscription.count({ where: { broadcasterId: twitch.broadcasterId } })
    : 0;

  // Derive each step from real config — this is what self-heals the checklist.
  const okByKey: Record<string, boolean> = {
    twitch: !!twitch?.broadcasterId,
    twitchSubs: twitchSubs > 0,
    overlay: !!alertSettings?.overlayToken,
    kick: !!kick,
    youtube: !!youtube,
    moderation: !!mod?.enabled,
    ai: !!integ.aiApiKey,
  };

  const progress = computeSetupProgress(okByKey);
  const items = progress.steps.map((s) => ({
    key: s.key,
    label: LABELS[s.key]?.label ?? s.key,
    hint: LABELS[s.key]?.hint ?? "",
    ok: s.ok,
    section: s.section,
    optional: s.optional,
    group: s.group,
  }));

  const autoOpen = shouldAutoOpenWizard({
    createdAt: tenant?.createdAt ?? null,
    setupCompletedAt: tenant?.setupCompletedAt ?? null,
    setupDismissedAt: tenant?.setupDismissedAt ?? null,
    allRequiredDone: progress.allRequiredDone,
    now: Date.now(),
  });

  return NextResponse.json({
    items, // back-compat for SetupStatusCard
    progress: {
      requiredDone: progress.requiredDone,
      requiredTotal: progress.requiredTotal,
      doneAll: progress.doneAll,
      totalAll: progress.totalAll,
      allRequiredDone: progress.allRequiredDone,
      percent: progress.percent,
    },
    completedAt: tenant?.setupCompletedAt ?? null,
    dismissedAt: tenant?.setupDismissedAt ?? null,
    autoOpen,
  });
}

// Record the wizard's own state so it stops auto-opening. `complete` = finished, `dismiss` =
// snooze ("later"), `reopen` = clear both (let it nudge again).
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }
  const action = body.action;
  if (action !== "complete" && action !== "dismiss" && action !== "reopen") {
    return NextResponse.json({ error: "action: complete | dismiss | reopen" }, { status: 400 });
  }

  const tid = await currentTenantId();
  if (!tid) return NextResponse.json({ ok: true, scoped: false }); // nothing to persist (legacy/no tenant scope)

  const now = new Date();
  const data =
    action === "complete" ? { setupCompletedAt: now, setupDismissedAt: null } :
    action === "dismiss" ? { setupDismissedAt: now } :
    { setupCompletedAt: null, setupDismissedAt: null };

  await prisma.tenant.update({ where: { id: tid }, data });
  return NextResponse.json({ ok: true });
}
