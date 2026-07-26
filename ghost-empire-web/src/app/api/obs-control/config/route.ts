// src/app/api/obs-control/config/route.ts
// PHASE 3C Slice 3 — serves the OBS-control browser source its config: the streamer's
// OBS WebSocket url + password (decrypted) and their enabled event->action rules.
//
// It also ships the PHILIPS HUE bridge credentials + rules (#813). That is not scope creep: the Hue
// Bridge sits on the streamer's LAN, so no serverless function can reach it, and this browser source
// is the only thing the portal runs on the streamer's own machine. The bridge key travels under
// exactly the same trust model as the OBS password already does — token-gated, no-store, consumed
// locally — and is the streamer's own local-network credential, not a platform secret.
// Token-gated (OVERLAY_TOKEN) + no-store. The OBS password is the streamer's OWN
// local-OBS secret, delivered only to a holder of the overlay token and consumed on
// the streamer's own machine — the same trust model as every other OBS browser source.
import { NextResponse } from "next/server";
import { isValidOverlayToken } from "@/lib/alerts";
import { currentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { ObsAction, ObsRule } from "@/lib/obs-rules";
import type { HueAction, HueRule } from "@/lib/hue-rules";

export const dynamic = "force-dynamic";

type Row = {
  enabled: boolean;
  triggerType: string;
  minAmount: number | null;
  actionKind: string;
  scene: string | null;
  source: string | null;
  filter: string | null;
  targetState: boolean | null;
  revertAfterMs: number | null;
  sortOrder: number;
};

function rowToAction(r: Row): ObsAction | null {
  const revertAfterMs = r.revertAfterMs;
  if (r.actionKind === "switch_scene" && r.scene) return { kind: "switch_scene", scene: r.scene, revertAfterMs };
  if (r.actionKind === "toggle_source" && r.scene && r.source) return { kind: "toggle_source", scene: r.scene, source: r.source, visible: !!r.targetState, revertAfterMs };
  if (r.actionKind === "toggle_filter" && r.source && r.filter) return { kind: "toggle_filter", source: r.source, filter: r.filter, enabled: !!r.targetState, revertAfterMs };
  return null;
}

type HueRow = {
  enabled: boolean;
  triggerType: string;
  minAmount: number | null;
  lightId: string | null;
  actionKind: string;
  color: string | null;
  revertColor: string | null;
  brightness: number | null;
  turnOn: boolean | null;
  revertAfterMs: number | null;
  sortOrder: number;
};

/** Flattened row → the discriminated action, or null when the row is missing what its kind needs. */
function hueRowToAction(r: HueRow): HueAction | null {
  const revertAfterMs = r.revertAfterMs;
  if (r.actionKind === "set_color" && r.color) return { kind: "set_color", hex: r.color, revertHex: r.revertColor, revertAfterMs };
  if (r.actionKind === "set_brightness" && r.brightness !== null) return { kind: "set_brightness", percent: r.brightness, revertAfterMs };
  if (r.actionKind === "turn") return { kind: "turn", on: !!r.turnOn, revertAfterMs };
  return null;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const tid = await currentTenantId();
  if (!(await isValidOverlayToken(token, tid))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfgRow = tid
    ? await prisma.integrationConfig.findFirst({ where: { tenantId: tid } })
    : await prisma.integrationConfig.findUnique({ where: { id: "default" } });

  const rows = await prisma.obsRule.findMany({
    where: { enabled: true, ...(tid ? { tenantId: tid } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const rules: ObsRule[] = rows.flatMap((r) => {
    const action = rowToAction(r as Row);
    return action ? [{ enabled: r.enabled, triggerType: r.triggerType, minAmount: r.minAmount, action, sortOrder: r.sortOrder }] : [];
  });

  // `.catch` so a portal whose hue_rules table predates the migration degrades to "no Hue rules"
  // rather than breaking the OBS controller's whole config fetch.
  const hueRows = await prisma.hueRule
    .findMany({ where: { enabled: true, ...(tid ? { tenantId: tid } : {}) }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })
    .catch(() => []);
  const hueRules: HueRule[] = hueRows.flatMap((r) => {
    const action = hueRowToAction(r as HueRow);
    return action
      ? [{ enabled: r.enabled, triggerType: r.triggerType, minAmount: r.minAmount, lightId: r.lightId, action, sortOrder: r.sortOrder }]
      : [];
  });

  return NextResponse.json(
    {
      obsUrl: cfgRow?.obsWebsocketUrl ?? null,
      obsPassword: decryptSecret(cfgRow?.obsWebsocketPassword) || null,
      rules,
      // Hue is only usable when BOTH the bridge address and its key are present, so send them as one
      // object: a half-configured bridge must not make the controller attempt LAN calls that hang.
      hue:
        cfgRow?.hueBridgeIp && decryptSecret(cfgRow?.hueApiKey)
          ? { bridgeIp: cfgRow.hueBridgeIp, apiKey: decryptSecret(cfgRow.hueApiKey)!, rules: hueRules }
          : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
