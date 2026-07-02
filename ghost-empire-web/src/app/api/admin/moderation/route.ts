// src/app/api/admin/moderation/route.ts
// Admin: read + save the global chat-moderation config (singleton). The pure
// detectors live in lib/moderation.ts; the bot fetches /api/bot/moderation and
// enforces the chosen action (delete / timeout / warn).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";
import { clampInt } from "@/lib/utils";

const ACTIONS = ["delete", "timeout", "warn"] as const;
const MAX_TIMEOUT = 1_209_600; // 14 days (Twitch max)

const pickAction = (v: unknown, fb: string) =>
  typeof v === "string" && (ACTIONS as readonly string[]).includes(v) ? v : fb;
const pickBool = (v: unknown, fb: boolean) => (typeof v === "boolean" ? v : fb);

// Per-tenant moderation config (get-or-create); legacy id:"default" when no tenant.
async function getConfig() {
  const tid = await currentTenantId();
  if (tid) {
    const existing = await prisma.moderationConfig.findFirst({ where: { tenantId: tid } });
    return existing ?? (await prisma.moderationConfig.create({ data: { tenantId: tid } }));
  }
  return prisma.moderationConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ config: await getConfig() });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cur = await getConfig();
  const words = Array.isArray(body.profanityWords)
    ? body.profanityWords.map((w) => String(w).trim().toLowerCase()).filter(Boolean).slice(0, 1000)
    : cur.profanityWords;
  const regex = Array.isArray(body.profanityRegex)
    ? body.profanityRegex.map((w) => String(w).trim()).filter(Boolean).slice(0, 200)
    : cur.profanityRegex;
  const linkWhitelist = Array.isArray(body.linkWhitelist)
    ? body.linkWhitelist.map((w) => String(w).trim().toLowerCase()).filter(Boolean).slice(0, 200)
    : cur.linkWhitelist;

  const updated = await prisma.moderationConfig.update({
    where: { id: cur.id },
    data: {
      enabled: pickBool(body.enabled, cur.enabled),

      profanityEnabled: pickBool(body.profanityEnabled, cur.profanityEnabled),
      profanityWords: words,
      profanityRegex: regex,
      profanityAction: pickAction(body.profanityAction, cur.profanityAction),
      profanityTimeoutSecs: clampInt(body.profanityTimeoutSecs, 1, MAX_TIMEOUT, cur.profanityTimeoutSecs),

      linkEnabled: pickBool(body.linkEnabled, cur.linkEnabled),
      linkWhitelist,
      linkAllowSubs: pickBool(body.linkAllowSubs, cur.linkAllowSubs),
      linkAction: pickAction(body.linkAction, cur.linkAction),
      linkTimeoutSecs: clampInt(body.linkTimeoutSecs, 1, MAX_TIMEOUT, cur.linkTimeoutSecs),

      capsEnabled: pickBool(body.capsEnabled, cur.capsEnabled),
      capsMinLetters: clampInt(body.capsMinLetters, 1, 200, cur.capsMinLetters),
      capsMaxRatioPct: clampInt(body.capsMaxRatioPct, 1, 100, cur.capsMaxRatioPct),
      capsAction: pickAction(body.capsAction, cur.capsAction),
      capsTimeoutSecs: clampInt(body.capsTimeoutSecs, 1, MAX_TIMEOUT, cur.capsTimeoutSecs),

      lengthEnabled: pickBool(body.lengthEnabled, cur.lengthEnabled),
      lengthMax: clampInt(body.lengthMax, 1, 5000, cur.lengthMax),
      lengthAction: pickAction(body.lengthAction, cur.lengthAction),
      lengthTimeoutSecs: clampInt(body.lengthTimeoutSecs, 1, MAX_TIMEOUT, cur.lengthTimeoutSecs),

      repeatEnabled: pickBool(body.repeatEnabled, cur.repeatEnabled),
      repeatCharRun: clampInt(body.repeatCharRun, 2, 200, cur.repeatCharRun),
      repeatWordRun: clampInt(body.repeatWordRun, 2, 100, cur.repeatWordRun),
      repeatAction: pickAction(body.repeatAction, cur.repeatAction),
      repeatTimeoutSecs: clampInt(body.repeatTimeoutSecs, 1, MAX_TIMEOUT, cur.repeatTimeoutSecs),

      zalgoEnabled: pickBool(body.zalgoEnabled, cur.zalgoEnabled),
      zalgoMaxRatioPct: clampInt(body.zalgoMaxRatioPct, 1, 100, cur.zalgoMaxRatioPct),
      zalgoAction: pickAction(body.zalgoAction, cur.zalgoAction),
      zalgoTimeoutSecs: clampInt(body.zalgoTimeoutSecs, 1, MAX_TIMEOUT, cur.zalgoTimeoutSecs),

      exemptSubs: pickBool(body.exemptSubs, cur.exemptSubs),
      exemptVips: pickBool(body.exemptVips, cur.exemptVips),
      exemptMods: pickBool(body.exemptMods, cur.exemptMods),
    },
  });

  await logAdminAction({ adminId: auth.userId, action: "update_moderation", targetType: "moderation", targetId: "default", req });
  return NextResponse.json({ ok: true, config: updated });
}
