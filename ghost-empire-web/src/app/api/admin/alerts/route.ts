// src/app/api/admin/alerts/route.ts
// Admin endpoint: GET settings + recent alerts, POST { action: "test" | "settings" }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { dispatchAlert, getSettings, regenerateOverlayToken, type AlertType } from "@/lib/alerts";
import { logAdminAction } from "@/lib/audit";

const ALL_TYPES: AlertType[] = [
  "shop_purchase",
  "event_win",
  "drop_claim_bonus",
  "twitch_sub",
  "twitch_gift_sub",
  "twitch_cheer",
  "donation",
  "welcome",
  "level_up",
  "test",
];

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [settings, recent] = await Promise.all([
    getSettings(),
    prisma.streamAlert.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    settings: {
      enabledTypes: settings.enabledTypes,
      durationMs: settings.durationMs,
      accentColor: settings.accentColor,
      soundEnabled: settings.soundEnabled,
      sizeScale: settings.sizeScale,
      textScale: settings.textScale,
      textColor: settings.textColor,
    },
    allTypes: ALL_TYPES,
    overlayToken: settings.overlayToken,
    recent: recent.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      message: a.message,
      icon: a.icon,
      actorName: a.actorName,
      amount: a.amount,
      amountLabel: a.amountLabel,
      createdAt: a.createdAt.toISOString(),
      shownAt: a.shownAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    action?: string;
    enabledTypes?: string[];
    durationMs?: number;
    accentColor?: string;
    soundEnabled?: boolean;
    sizeScale?: number;
    textScale?: number;
    textColor?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "test") {
    const alert = await dispatchAlert({
      type: "test",
      title: "🧪 Test alert",
      message: "Jeśli to widzisz na overlay — działa!",
      icon: "🧪",
      actorName: "Admin Test",
      amount: 1337,
      amountLabel: "GT",
    });
    await logAdminAction({
      adminId: auth.userId,
      action: "test_alert",
      targetId: alert?.id,
      req,
    });
    return NextResponse.json({ ok: true, alertId: alert?.id ?? null });
  }

  if (body.action === "settings") {
    // Validate enabledTypes — must be subset of known types
    let enabledTypes: string[] | undefined;
    if (Array.isArray(body.enabledTypes)) {
      enabledTypes = body.enabledTypes.filter((t) =>
        (ALL_TYPES as readonly string[]).includes(t),
      );
    }
    let durationMs: number | undefined;
    if (typeof body.durationMs === "number") {
      durationMs = Math.max(1500, Math.min(20_000, Math.round(body.durationMs)));
    }
    let accentColor: string | undefined;
    if (typeof body.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.accentColor)) {
      accentColor = body.accentColor;
    }
    const soundEnabled = typeof body.soundEnabled === "boolean" ? body.soundEnabled : undefined;
    const clampScale = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(2, Math.max(0.5, Math.round(v * 100) / 100)) : undefined;
    const sizeScale = clampScale(body.sizeScale);
    const textScale = clampScale(body.textScale);
    let textColor: string | undefined;
    if (typeof body.textColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.textColor)) {
      textColor = body.textColor;
    }

    // getSettings() resolves (and lazy-creates) the CURRENT tenant's settings row
    // (legacy "default" row in single-tenant mode) — update by its real id.
    const settings = await getSettings();
    const updated = await prisma.streamAlertSettings.update({
      where: { id: settings.id },
      data: {
        ...(enabledTypes ? { enabledTypes } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(accentColor ? { accentColor } : {}),
        ...(soundEnabled !== undefined ? { soundEnabled } : {}),
        ...(sizeScale !== undefined ? { sizeScale } : {}),
        ...(textScale !== undefined ? { textScale } : {}),
        ...(textColor ? { textColor } : {}),
      },
    });

    await logAdminAction({
      adminId: auth.userId,
      action: "update_alert_settings",
      details: {
        enabledTypes: updated.enabledTypes,
        durationMs: updated.durationMs,
        accentColor: updated.accentColor,
        soundEnabled: updated.soundEnabled,
      },
      req,
    });

    return NextResponse.json({
      ok: true,
      settings: {
        enabledTypes: updated.enabledTypes,
        durationMs: updated.durationMs,
        accentColor: updated.accentColor,
        soundEnabled: updated.soundEnabled,
        sizeScale: updated.sizeScale,
        textScale: updated.textScale,
        textColor: updated.textColor,
      },
    });
  }

  if (body.action === "regenerate_token") {
    const updated = await regenerateOverlayToken();
    await logAdminAction({
      adminId: auth.userId,
      action: "update_alert_settings",
      details: { tokenRotated: true },
      req,
    });
    return NextResponse.json({ ok: true, overlayToken: updated.overlayToken });
  }

  return NextResponse.json({ error: "action: test | settings | regenerate_token" }, { status: 400 });
}
